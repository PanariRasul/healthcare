// server/src/ipd.controller.js
import prisma from "../lib/prisma.js";
import {
  buildDocumentKey,
  uploadBufferToR2,
  deleteObjectFromR2,
  deleteManyObjectsFromR2,
} from "../lib/r2.js";
import {
  conditionToDb,
  followUpStatusToDb,
  reminderStatusToDb,
  mapPatientEnums,
} from "../utils/enumMapper.js";

// ---------- helpers ----------

const DISCHARGE_STATUSES = ["Admitted", "Ready For Discharge", "Discharged"];

// Money is stored as Float — round to 2 decimals so edits never introduce
// binary rounding artifacts into totalStay/balance (mirrors the same helper
// in ipdPayment.controller.js).
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function generateSerialNumber() {
  const last = await prisma.iPD_Patient.findFirst({
    orderBy: { createdAt: "desc" },
    select: { serialNumber: true },
  });
  const lastNum = last?.serialNumber
    ? parseInt(last.serialNumber.replace("IPD-", "")) || 0
    : 0;
  const next = lastNum + 1;
  return `IPD-${String(next).padStart(3, "0")}`;
}

// Kept in sync with calcSettlement() in ipdPayment.controller.js — both
// controllers can end up computing a patient's settlement status, so they
// need to agree (including the "Overpaid" state; see buildPatientData()
// below for why balance is allowed to go negative here too).
function calcSettlement(totalStay, totalPaid) {
  const stay = round2(totalStay);
  const paid = round2(totalPaid);
  if (paid <= 0) return "Pending";
  if (paid > stay) return "Overpaid";
  if (paid === stay) return "Fully Paid";
  return "Partially Paid";
}

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Normalizes incoming body into the flat patient fields + computed totals.
//
// `existingTotalPaid` (pass this on UPDATE only) is the current, authoritative
// totalPaid already stored on the patient — which is normally maintained by
// ipdPayment.controller.js's recalcPatientTotals() from the real IPD_Payment
// ledger (including any overpayment/credit). When it's provided, that value
// — not deposit+cash+upi+card from this form submission — is what balance
// and settlementStatus get computed from, and it's what gets saved back.
//
// Why this matters: deposit/cash/upi/card here represent the amount entered
// at admission time. Without this guard, saving ANY edit through this form
// (e.g. adding a daily charge, editing follow-up notes) would recompute
// totalPaid from those four fields alone and silently overwrite the real
// payment total — wiping out every payment recorded afterwards through the
// Payments module, even though the actual IPD_Payment rows are untouched.
// On CREATE there's no existing payment history yet, so deposit+cash+upi+card
// is correctly the starting totalPaid.
function buildPatientData(body, { existingTotalPaid } = {}) {
  const dailyCharges = Array.isArray(body.dailyCharges)
    ? body.dailyCharges
    : [];
  const medicines = Array.isArray(body.medicines) ? body.medicines : [];
  const additionalCharges = Array.isArray(body.additionalCharges)
    ? body.additionalCharges
    : [];

  const deposit = toNum(body.deposit);
  const cash = toNum(body.cash);
  const upi = toNum(body.upi);
  const card = toNum(body.card);
  const enteredPaid = deposit + cash + upi + card;

  const totalStay = dailyCharges.reduce((s, c) => s + toNum(c.amount), 0);

  // On update, trust the Payments-module total; on create, seed it from
  // whatever was entered as the initial admission payment.
  const totalPaid = round2(
    typeof existingTotalPaid === "number" ? existingTotalPaid : enteredPaid,
  );
  // Not clamped to 0 — a negative balance is an advance credit (see the
  // Payments module), and clamping here would silently erase it every time
  // a patient record is edited.
  const balance = round2(totalStay - totalPaid);

  const dischargeStatus = body.dischargeStatus || "Admitted";
  const status = dischargeStatus === "Discharged" ? "Discharged" : "Admitted";

  const reminderEnabled =
    body.reminderEnabled === true || body.reminderEnabled === "true";

  return {
    flat: {
      name: body.name,
      age: parseInt(body.age) || 0,
      gender: body.gender,
      phone: body.phone || null,
      aadhar: body.aadhar || null,
      address: body.address || null,

      admissionDate: new Date(body.admissionDate),
      admissionTime: body.admissionTime,
      expectedDays: body.expectedDays ? parseInt(body.expectedDays) : null,
      dischargeDate: body.dischargeDate ? new Date(body.dischargeDate) : null,
      dischargeTime: body.dischargeTime || null,
      status,
      dischargeStatus,
      notes: body.notes || null,

      // --- Follow-up & reminder tracking ---
      followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
      condition: conditionToDb(body.condition || null),
      followUpDesc: body.followUpDesc || null,
      followUpStatus: followUpStatusToDb(body.followUpStatus || "Pending"),
      reminderEnabled,
      reminderStatus: reminderStatusToDb(
        reminderEnabled ? body.reminderStatus || "Pending" : "Not Set",
      ),
      reminderSentDate: body.reminderSentDate
        ? new Date(body.reminderSentDate)
        : null,

      deposit,
      cash,
      upi,
      card,
      totalPaid,
      totalStay,
      balance,
      settlementStatus: calcSettlement(totalStay, totalPaid),

      oil: parseInt(body.oil) || 0,
      protein: parseInt(body.protein) || 0,
      syrup: parseInt(body.syrup) || 0,
    },

    dailyCharges: dailyCharges.map((c) => ({
      date: new Date(c.date || body.admissionDate),
      days: toNum(c.days),
      rate: toNum(c.rate),
      amount: toNum(c.amount),
    })),

    medicines: medicines
      .filter((m) => m.name && m.name.trim())
      .map((m) => ({
        medicineId: m.medicineId || null,
        name: m.name.trim(),
        quantity: toNum(m.quantity),
        unit: m.unit || "Tablets",
        dosage: m.dosage || null,
        frequency: m.frequency || null,
        duration: m.duration || null,
        instructions: m.instructions || null,
      })),

    additionalCharges: additionalCharges.map((c) => ({
      label: c.label,
      chargeType: c.chargeType || "ONE_TIME",
      rate: toNum(c.rate),
      days: toNum(c.days),
      amount: toNum(c.amount),
    })),
  };
}

// Thrown for any pharmacy-stock problem hit while saving an IPD patient's
// medicines (missing medicine, not enough stock left). Kept as its own class
// so createPatient/updatePatient can tell "bad request" (400) apart from a
// genuine server error (500) after it bubbles up out of a $transaction.
class StockError extends Error {}

// Actually applies the pharmacy-stock impact of an IPD patient's medicines —
// this is the fix for medicines not being deducted from stock at all.
//
// Works on the NET DIFFERENCE between what the patient's medicines list used
// to be (`previousMedicines`, straight from the DB) and what it's being
// saved as now (`newMedicines`), grouped by medicineId:
//   - On CREATE, previousMedicines is [], so every medicine's full quantity
//     is deducted.
//   - On UPDATE, only the delta moves: increasing a quantity (or adding a
//     new medicine) deducts the extra amount; decreasing a quantity (or
//     removing a medicine) returns the difference to stock. Saving the same
//     medicines/quantities again is a no-op — nothing is double-deducted.
// Every actual stock change is logged to StockHistory, same as OPD
// prescriptions and the Pharmacy "Add/Reduce Stock" action, so the trail is
// consistent across the whole app.
//
// Must be called with a Prisma transaction client (`tx`) so the stock
// check/update and the patient/medicine rows commit or roll back together.
async function applyIpdMedicineStockChanges(
  tx,
  { previousMedicines = [], newMedicines = [], contextLabel },
) {
  const deltas = new Map(); // medicineId -> net tablets needed (positive = deduct, negative = restock)

  for (const m of previousMedicines) {
    if (!m.medicineId) continue;
    deltas.set(
      m.medicineId,
      (deltas.get(m.medicineId) || 0) - (toNum(m.quantity) || 0),
    );
  }
  for (const m of newMedicines) {
    if (!m.medicineId) continue;
    deltas.set(
      m.medicineId,
      (deltas.get(m.medicineId) || 0) + (toNum(m.quantity) || 0),
    );
  }

  for (const [medicineId, delta] of deltas.entries()) {
    if (!delta) continue; // unchanged — nothing to do

    const med = await tx.medicine.findUnique({ where: { id: medicineId } });
    if (!med) {
      throw new StockError(
        "A selected medicine no longer exists in the pharmacy catalog.",
      );
    }
    if (delta > 0 && med.quantity < delta) {
      throw new StockError(
        `Only ${med.quantity} unit(s) of "${med.drugName}" are in stock (this change needs ${delta} more).`,
      );
    }

    await tx.medicine.update({
      where: { id: medicineId },
      data: { quantity: med.quantity - delta },
    });

    await tx.stockHistory.create({
      data: {
        medicineId,
        date: new Date(),
        action: delta > 0 ? "REDUCE" : "ADD",
        // Positive quantity = added to stock, negative = removed —
        // consistent with OPD's createPrescription and the Pharmacy
        // Add/Reduce Stock action.
        quantity: -delta,
        reason:
          delta > 0
            ? `Dispensed for ${contextLabel}`
            : `Stock restored — medicine list updated for ${contextLabel}`,
      },
    });
  }
}

const patientInclude = {
  dailyCharges: { orderBy: { date: "asc" } },

  // `medicine: { select: { sellingPrice: true } }` is included so the
  // OPD/IPD "Generate Invoice" screen can prefill each medicine's price —
  // previously this returned bare IPD_Medicine rows with no price at all,
  // which is why invoice line items always came in at ₹0 and had to be
  // typed in by hand.
  medicines: {
    include: {
      medicine: { select: { sellingPrice: true } },
    },
  },

  additionalCharges: {
    orderBy: {
      createdAt: "asc",
    },
  },

  documents: {
    orderBy: {
      createdAt: "desc",
    },
  },
};

// ---------- controllers ----------

// GET /api/ipd/patients
export async function listPatients(req, res) {
  try {
    const { search = "", status = "", page = "1", limit = "7" } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 7);

    const where = {
      AND: [
        search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { serialNumber: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        status ? { status } : {},
      ],
    };

    const [total, patients] = await Promise.all([
      prisma.iPD_Patient.count({ where }),
      prisma.iPD_Patient.findMany({
        where,
        include: patientInclude,
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
    ]);

    res.json({
      data: mapPatientEnums(patients),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    console.error("listPatients error:", err);
    res.status(500).json({ message: "Failed to fetch IPD patients" });
  }
}

// GET /api/ipd/patients/followups
// Anyone with an actual follow-up date set, soonest first — mirrors the OPD
// follow-ups endpoint so IPDFollowUps.jsx can reuse the same UX/shape.
// IMPORTANT: must be registered before "/:id" in the routes file.
export async function listFollowUps(req, res) {
  try {
    const patients = await prisma.iPD_Patient.findMany({
      where: { followUpDate: { not: null } },
      include: patientInclude,
      orderBy: { followUpDate: "asc" },
    });
    res.json({ patients: mapPatientEnums(patients) });
  } catch (err) {
    console.error("listFollowUps error:", err);
    res.status(500).json({ message: "Failed to fetch IPD follow-ups" });
  }
}

// GET /api/ipd/patients/:id
export async function getPatient(req, res) {
  try {
    const patient = await prisma.iPD_Patient.findUnique({
      where: { id: req.params.id },
      include: patientInclude,
    });
    if (!patient) return res.status(404).json({ message: "Patient not found" });
    res.json(mapPatientEnums(patient));
  } catch (err) {
    console.error("getPatient error:", err);
    res.status(500).json({ message: "Failed to fetch patient" });
  }
}

// GET /api/ipd/patients/stats  (for dashboard)
export async function getStats(req, res) {
  try {
    const [
      admittedCount,
      dischargedCount,
      totalCount,
      admittedPatients,
      allPatients,
      recentDischarges,
    ] = await Promise.all([
      prisma.iPD_Patient.count({ where: { status: "Admitted" } }),
      prisma.iPD_Patient.count({ where: { status: "Discharged" } }),
      prisma.iPD_Patient.count(),
      prisma.iPD_Patient.findMany({
        where: { status: "Admitted" },
        orderBy: { admissionDate: "desc" },
      }),
      prisma.iPD_Patient.findMany(),
      prisma.iPD_Patient.findMany({
        where: { status: "Discharged" },
        orderBy: { dischargeDate: "desc" },
        take: 4,
      }),
    ]);

    const totalBalance = admittedPatients.reduce((s, p) => s + p.balance, 0);
    const totalDeposits = allPatients.reduce((s, p) => s + p.deposit, 0);
    const totalCash = allPatients.reduce((s, p) => s + p.cash, 0);
    const totalUpi = allPatients.reduce((s, p) => s + p.upi, 0);

    res.json({
      totalAdmittedEver: totalCount,
      activeCount: admittedCount,
      dischargedCount,
      totalBalance,
      totalDeposits,
      totalCash,
      totalUpi,
      activePatients: admittedPatients,
      recentDischarges,
    });
  } catch (err) {
    console.error("getStats error:", err);
    res.status(500).json({ message: "Failed to fetch IPD stats" });
  }
}

// POST /api/ipd/patients
export async function createPatient(req, res) {
  try {
    const { flat, dailyCharges, medicines, additionalCharges } =
      buildPatientData(req.body);

    const serialNumber = await generateSerialNumber();

    const patient = await prisma.$transaction(
      async (tx) => {
        const created = await tx.iPD_Patient.create({
          data: {
            ...flat,
            serialNumber,

            dailyCharges: {
              create: dailyCharges,
            },

            medicines: {
              create: medicines,
            },

            additionalCharges: {
              create: additionalCharges,
            },
          },
          include: patientInclude,
        });

        // Actually deduct the prescribed medicines from pharmacy stock —
        // previously this only validated availability and never touched
        // `medicine.quantity`, so stock was never reduced on admission.
        await applyIpdMedicineStockChanges(tx, {
          previousMedicines: [],
          newMedicines: medicines,
          contextLabel: `IPD patient ${created.name} (${created.serialNumber})`,
        });

        return created;
      },
      { timeout: 15000, maxWait: 10000 },
    );

    res.status(201).json(mapPatientEnums(patient));
  } catch (err) {
    if (err instanceof StockError) {
      return res.status(400).json({ message: err.message });
    }
    console.error("createPatient error:", err);
    res.status(500).json({ message: "Failed to create patient" });
  }
}

// PUT /api/ipd/patients/:id
export async function updatePatient(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.iPD_Patient.findUnique({
      where: { id },
      include: { medicines: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const { flat, dailyCharges, medicines, additionalCharges } =
      buildPatientData(req.body, { existingTotalPaid: existing.totalPaid });

    // Kept to a minimal number of round-trips (3 deletes + 1 update + 1
    // createMany) so the interactive transaction stays well inside its
    // timeout. Previously additionalCharges was inserted via a for-loop of
    // individual create() calls, which added one extra round-trip per charge
    // and — combined with per-query latency — could push the whole
    // transaction past Prisma's default 5s interactive-transaction timeout
    // (P2028). If you're still seeing timeouts after this change, the DB
    // connection itself has high per-query latency (e.g. a pooled/serverless
    // Postgres) and is the thing to investigate next.
    await prisma.$transaction(
      async (tx) => {
        // Apply the net stock change BEFORE the old medicine rows are wiped
        // out below — `existing.medicines` (fetched above, pre-transaction)
        // is the "before" picture, `medicines` is the "after" picture. Only
        // the difference between the two moves stock, so unrelated edits
        // (e.g. changing a daily charge) never re-deduct medicines that were
        // already dispensed.
        await applyIpdMedicineStockChanges(tx, {
          previousMedicines: existing.medicines,
          newMedicines: medicines,
          contextLabel: `IPD patient ${existing.name} (${existing.serialNumber})`,
        });

        await tx.iPD_DailyCharge.deleteMany({ where: { patientId: id } });
        await tx.iPD_Medicine.deleteMany({ where: { patientId: id } });
        await tx.iPD_AdditionalCharge.deleteMany({ where: { patientId: id } });

        await tx.iPD_Patient.update({
          where: { id },
          data: {
            ...flat,

            dailyCharges: {
              create: dailyCharges,
            },

            medicines: {
              create: medicines,
            },
          },
        });

        if (additionalCharges.length > 0) {
          await tx.iPD_AdditionalCharge.createMany({
            data: additionalCharges.map((charge) => ({
              patientId: id,
              label: charge.label,
              chargeType: charge.chargeType,
              rate: Number(charge.rate),
              days: Number(charge.days),
              amount: Number(charge.amount),
            })),
          });
        }
      },
      { timeout: 15000, maxWait: 10000 },
    );

    const fullPatient = await prisma.iPD_Patient.findUnique({
      where: { id },
      include: patientInclude,
    });

    res.json(mapPatientEnums(fullPatient));
  } catch (err) {
    if (err instanceof StockError) {
      return res.status(400).json({ message: err.message });
    }
    console.error("updatePatient error:", err);
    res.status(500).json({
      message: "Failed to update patient",
      error: err.message,
    });
  }
}

// PATCH /api/ipd/patients/:id/discharge
// Dedicated, narrow endpoint for transitioning a patient's discharge state
// — used by the "Discharge Patient" / "Undo Discharge" quick actions.
//
// Deliberately does NOT go through buildPatientData()/updatePatient: it
// only ever touches dischargeStatus, status, dischargeDate, and
// dischargeTime. It never recomputes or touches totalStay, totalPaid,
// balance, settlementStatus, daily charges, medicines, or additional
// charges — so marking someone discharged can never accidentally disturb
// their billing figures or clinical records.
export async function dischargePatient(req, res) {
  try {
    const { id } = req.params;
    const { dischargeStatus, dischargeDate, dischargeTime } = req.body;

    if (!DISCHARGE_STATUSES.includes(dischargeStatus)) {
      return res.status(400).json({
        message: `dischargeStatus must be one of: ${DISCHARGE_STATUSES.join(", ")}`,
      });
    }

    const patient = await prisma.iPD_Patient.findUnique({ where: { id } });
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    const data = { dischargeStatus };

    if (dischargeStatus === "Admitted") {
      // "Undo Discharge" — fully reverts the patient back to an active
      // admission and clears the discharge record.
      data.status = "Admitted";
      data.dischargeDate = null;
      data.dischargeTime = null;
    } else {
      // "Ready For Discharge" still counts as an occupied bed; only a
      // full "Discharged" flips the coarse `status` field used elsewhere
      // in the app (bed-occupancy counts, the Admitted/Discharged filter).
      data.status = dischargeStatus === "Discharged" ? "Discharged" : "Admitted";

      const rawDate = dischargeDate || patient.dischargeDate || new Date();
      const parsedDate = new Date(rawDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "dischargeDate is not a valid date" });
      }

      const admissionMidnight = new Date(patient.admissionDate);
      admissionMidnight.setHours(0, 0, 0, 0);
      if (parsedDate < admissionMidnight) {
        return res.status(400).json({
          message: "Discharge date cannot be before the admission date",
        });
      }

      data.dischargeDate = parsedDate;
      // "Take system timing" — the client only asks for a date; the actual
      // discharge TIME is always the server's current clock time at the
      // moment this request is processed, unless the caller explicitly
      // sent one (e.g. correcting a past record from the edit form).
      data.dischargeTime =
        dischargeTime || new Date().toTimeString().slice(0, 5);
    }

    const updated = await prisma.iPD_Patient.update({
      where: { id },
      data,
      include: patientInclude,
    });

    res.json(mapPatientEnums(updated));
  } catch (err) {
    if (err.code === "P2025")
      return res.status(404).json({ message: "Patient not found" });
    console.error("dischargePatient error:", err);
    res.status(500).json({ message: "Failed to update discharge status" });
  }
}

// DELETE /api/ipd/patients/:id
export async function deletePatient(req, res) {
  try {
    const { id } = req.params;

    // Clean up every document this patient has in R2 before cascade-deleting
    // the DB rows, so nothing is ever left orphaned in the bucket.
    const docs = await prisma.iPD_Document.findMany({
      where: { patientId: id },
    });
    await deleteManyObjectsFromR2(docs.map((d) => d.key));

    await prisma.iPD_Patient.delete({ where: { id } }); // cascades to related tables
    res.json({ message: "Patient deleted" });
  } catch (err) {
    if (err.code === "P2025")
      return res.status(404).json({ message: "Patient not found" });
    console.error("deletePatient error:", err);
    res.status(500).json({ message: "Failed to delete patient" });
  }
}

// ---------- documents ----------

// POST /api/ipd/patients/:id/documents  (multipart/form-data: file, type)
export async function uploadDocument(req, res) {
  try {
    const { id } = req.params;
    const patient = await prisma.iPD_Patient.findUnique({ where: { id } });
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // Object key follows: IPD documents/{SerialNumber}-{PatientName}/{unique}-{filename}
    const key = buildDocumentKey(
      patient.serialNumber,
      patient.name,
      req.file.originalname,
    );
    const url = await uploadBufferToR2({
      key,
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
    });

    const doc = await prisma.iPD_Document.create({
      data: {
        name: req.file.originalname,
        type: req.body.type || "Prescription",
        url,
        key,
        fileType: req.file.mimetype,
        patientId: id,
      },
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error("uploadDocument error:", err);
    res
      .status(500)
      .json({ message: err.message || "Failed to upload document" });
  }
}

// DELETE /api/ipd/patients/:id/documents/:docId
export async function deleteDocument(req, res) {
  try {
    const { docId } = req.params;
    const doc = await prisma.iPD_Document.findUnique({ where: { id: docId } });
    if (!doc) return res.status(404).json({ message: "Document not found" });

    await deleteObjectFromR2(doc.key);
    await prisma.iPD_Document.delete({ where: { id: docId } });

    res.json({ message: "Document deleted" });
  } catch (err) {
    console.error("deleteDocument error:", err);
    res.status(500).json({ message: "Failed to delete document" });
  }
}