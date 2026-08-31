// server/src/IPD/ipd.controller.js
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
import {
  getFinalizedInvoiceFor,
  syncRefundToInvoice,
} from "../Invoice/invoice.controller.js";
// totalPaid / balance / settlement / the refund cap all live in one place —
// see the header of ipdTotals.js for why.
import {
  round2,
  calcSettlement,
  sumAdvances,
  sumLedger,
  deriveTotals,
  checkRefund,
} from "./ipdTotals.js";

// ---------- helpers ----------

const DISCHARGE_STATUSES = ["Admitted", "Ready For Discharge", "Discharged"];

const REFUND_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Other"];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Day count between two dates with BOTH ends counted, matching how the ward
// bills a stay: 01/01/2026 → 10/01/2026 is 10 days, not 9. A missing end
// date means "still running", so it counts up to today. Never returns less
// than 1 (a same-day admission is one billable day).
function inclusiveDays(fromDate, toDate) {
  if (!fromDate) return 1;
  const start = new Date(fromDate);
  const end = toDate ? new Date(toDate) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((end - start) / MS_PER_DAY) + 1);
}

async function generateSerialNumber() {
  // Ordered by serialNumber (not createdAt) so an imported or back-dated row
  // can never hand out a number that's already taken.
  const last = await prisma.iPD_Patient.findFirst({
    orderBy: { serialNumber: "desc" },
    select: { serialNumber: true },
  });
  const lastNum = last?.serialNumber
    ? parseInt(last.serialNumber.replace("IPD-", ""), 10) || 0
    : 0;
  const next = lastNum + 1;
  return `IPD-${String(next).padStart(3, "0")}`;
}

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Normalises the refund fields off a request body. Returns null when the
// caller didn't mention a refund at all, so an old client that doesn't send
// these fields leaves whatever is already stored alone.
function readRefund(body) {
  if (!Object.prototype.hasOwnProperty.call(body, "refundAmount")) return null;

  const amount = Math.max(0, round2(body.refundAmount));
  let date = body.refundDate ? new Date(body.refundDate) : null;
  if (date && Number.isNaN(date.getTime())) date = null;
  // An amount with no date is stamped today, so the bill always shows when
  // the money went back.
  if (amount > 0 && !date) date = new Date();

  return {
    refundAmount: amount,
    refundReason: amount > 0 ? body.refundReason?.trim() || null : null,
    refundDate: amount > 0 ? date : null,
    refundMethod: amount > 0 ? body.refundMethod || "Cash" : null,
  };
}

// `ledgerPaid` is the sum of this patient's IPD_Payment rows. It is ADDED to
// the advances typed on the admission form, rather than one replacing the
// other — see ipdTotals.js. The old code passed the stored totalPaid
// straight through on update, which meant editing the Deposit box changed
// nothing and left the record inconsistent with itself.
function buildPatientData(body, { ledgerPaid = 0 } = {}) {
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

  const totalStay = dailyCharges.reduce((s, c) => s + toNum(c.amount), 0);

  // Both sources of money count.
  const totalPaid = round2(
    sumAdvances({ deposit, cash, upi, card }) + round2(ledgerPaid),
  );

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
      // balance and settlementStatus are set by the caller, which knows the
      // refund that applies. See createPatient / updatePatient.

      oil: parseInt(body.oil) || 0,
      protein: parseInt(body.protein) || 0,
      syrup: parseInt(body.syrup) || 0,
    },

    dailyCharges: dailyCharges.map((c) => {
      const from = c.date || body.admissionDate;
      const to = c.toDate || null;
      const manual = c.daysManual === true || c.daysManual === "true";
      // A manual figure is stored exactly as typed. An automatic one is
      // (re)derived here so the server and the form always agree, and so a
      // client that sends a stale value can't skew the bill.
      const days = manual ? toNum(c.days) : inclusiveDays(from, to);
      const rate = toNum(c.rate);
      return {
        date: new Date(from),
        toDate: to ? new Date(to) : null,
        days,
        daysManual: manual,
        rate,
        amount: round2(days * rate),
      };
    }),

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
      amountPaid: toNum(c.amountPaid),
      paymentDate: c.paymentDate ? new Date(c.paymentDate) : null,
      paymentStatus: c.paymentStatus || "Pending",
    })),

    refund: readRefund(body),
  };
}

class StockError extends Error {}

async function applyIpdMedicineStockChanges(
  tx,
  { previousMedicines = [], newMedicines = [], contextLabel },
) {
  const deltas = new Map();

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
    if (!delta) continue;

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
    const totalRefunds = allPatients.reduce(
      (s, p) => s + (p.refundAmount || 0),
      0,
    );

    res.json({
      totalAdmittedEver: totalCount,
      activeCount: admittedCount,
      dischargedCount,
      totalBalance,
      totalDeposits,
      totalCash,
      totalUpi,
      totalRefunds,
      activePatients: admittedPatients,
      recentDischarges,
    });
  } catch (err) {
    console.error("getStats error:", err);
    res.status(500).json({ message: "Failed to fetch IPD stats" });
  }
}

export async function createPatient(req, res) {
  try {
    const { flat, dailyCharges, medicines, additionalCharges, refund } =
      buildPatientData(req.body);

    const refundData = refund || {
      refundAmount: 0,
      refundReason: null,
      refundDate: null,
      refundMethod: null,
    };

    const refundProblem = checkRefund(
      flat.totalStay,
      flat.totalPaid,
      refundData.refundAmount,
    );
    if (refundProblem) return res.status(400).json({ message: refundProblem });

    const derived = deriveTotals({
      totalStay: flat.totalStay,
      totalPaid: flat.totalPaid,
      refundAmount: refundData.refundAmount,
    });
    flat.balance = derived.balance;
    flat.settlementStatus = derived.settlementStatus;

    const serialNumber = await generateSerialNumber();

    const patient = await prisma.$transaction(
      async (tx) => {
        const created = await tx.iPD_Patient.create({
          data: {
            ...flat,
            ...refundData,
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

    // Payments recorded on the Payments screen are added to the advances
    // typed on this form; neither erases the other.
    const ledgerPaid = await sumLedger(prisma, id);

    const { flat, dailyCharges, medicines, additionalCharges, refund } =
      buildPatientData(req.body, { ledgerPaid });

    // The admission edit form now edits the refund directly. When the client
    // didn't send the field at all (an older build, or a partial update),
    // keep whatever is already stored rather than silently clearing it.
    const refundData = refund || {
      refundAmount: existing.refundAmount || 0,
      refundReason: existing.refundReason,
      refundDate: existing.refundDate,
      refundMethod: existing.refundMethod,
    };

    const refundProblem = checkRefund(
      flat.totalStay,
      flat.totalPaid,
      refundData.refundAmount,
    );
    if (refundProblem) return res.status(400).json({ message: refundProblem });

    const derived = deriveTotals({
      totalStay: flat.totalStay,
      totalPaid: flat.totalPaid,
      refundAmount: refundData.refundAmount,
    });
    flat.balance = derived.balance;
    flat.settlementStatus = derived.settlementStatus;

    await prisma.$transaction(
      async (tx) => {
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
            ...refundData,

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
              amountPaid: Number(charge.amountPaid),
              paymentDate: charge.paymentDate,
              paymentStatus: charge.paymentStatus,
            })),
          });
        }
      },
      { timeout: 15000, maxWait: 10000 },
    );

    // Push the refund onto the patient's draft invoice so the bill shows it
    // without anyone re-opening the invoice screen. Best-effort: a failure
    // here must not lose the patient edit that already committed.
    if (refund) {
      try {
        await syncRefundToInvoice(id, refundData);
      } catch (syncErr) {
        console.error("updatePatient → syncRefundToInvoice failed:", syncErr);
      }
    }

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

// PATCH /api/ipd/:id/refund
// Body: { refundAmount, refundReason?, refundDate?, refundMethod? }
//
// Records money handed back to the patient — the deposit-₹10,000 /
// bill-₹5,000 / refund-₹5,000 case. Recalculates the patient's balance and
// mirrors the figures onto their DRAFT invoice so the refund prints on the
// bill. A finalized invoice keeps the numbers it was issued with.
//
// This is the same field the admission edit form writes; both paths end up
// on IPD_Patient.refundAmount, which is the single source of truth.
export async function setRefund(req, res) {
  try {
    const { id } = req.params;
    const { refundMethod } = req.body;

    const patient = await prisma.iPD_Patient.findUnique({ where: { id } });
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    const refundData = readRefund(req.body);
    if (!refundData) {
      return res.status(400).json({ message: "refundAmount is required" });
    }
    if (!Number.isFinite(refundData.refundAmount)) {
      return res
        .status(400)
        .json({ message: "Refund amount must be zero or a positive number." });
    }
    const refundProblem = checkRefund(
      patient.totalStay,
      patient.totalPaid,
      refundData.refundAmount,
    );
    if (refundProblem) return res.status(400).json({ message: refundProblem });
    if (refundMethod && !REFUND_METHODS.includes(refundMethod)) {
      return res.status(400).json({
        message: `refundMethod must be one of: ${REFUND_METHODS.join(", ")}`,
      });
    }

    const derived = deriveTotals({
      totalStay: patient.totalStay,
      totalPaid: patient.totalPaid,
      refundAmount: refundData.refundAmount,
    });

    const updated = await prisma.iPD_Patient.update({
      where: { id },
      data: {
        ...refundData,
        balance: derived.balance,
        settlementStatus: derived.settlementStatus,
      },
      include: patientInclude,
    });

    // Best-effort — a failure here must not lose the refund itself.
    let invoice = null;
    try {
      invoice = await syncRefundToInvoice(id, refundData);
    } catch (syncErr) {
      console.error("setRefund → syncRefundToInvoice failed:", syncErr);
    }

    res.json({ patient: mapPatientEnums(updated), invoice });
  } catch (err) {
    console.error("setRefund error:", err);
    res.status(500).json({ message: "Failed to record the refund" });
  }
}

// GET /api/ipd/:id/discharge-readiness -> { ready, reason, invoice }
//
// Lets the Discharge dialog explain up front what still needs doing, rather
// than only failing once the user hits Confirm.
export async function getDischargeReadiness(req, res) {
  try {
    const { id } = req.params;
    const patient = await prisma.iPD_Patient.findUnique({ where: { id } });
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    const { invoice, finalized } = await getFinalizedInvoiceFor("IPD", id);

    if (!invoice) {
      return res.json({
        ready: false,
        reason: "NO_INVOICE",
        message:
          "This patient has no invoice yet. Generate the invoice, check every charge, then finalize it.",
        invoice: null,
      });
    }
    if (!finalized) {
      return res.json({
        ready: false,
        reason: "NOT_FINALIZED",
        message: `Invoice ${invoice.invoiceNumber} is still a draft. Review it and finalize it to lock the bill before discharge.`,
        invoice,
      });
    }

    res.json({ ready: true, reason: null, message: null, invoice });
  } catch (err) {
    console.error("getDischargeReadiness error:", err);
    res.status(500).json({ message: "Failed to check discharge readiness" });
  }
}

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

    // --- Invoice gate -----------------------------------------------------
    // A patient can only leave once their bill is locked. Undoing a
    // discharge and marking "Ready For Discharge" stay open, since neither
    // ends the stay.
    if (dischargeStatus === "Discharged") {
      const { invoice, finalized } = await getFinalizedInvoiceFor("IPD", id);

      if (!invoice) {
        return res.status(409).json({
          code: "NO_INVOICE",
          message:
            "Generate this patient's invoice and finalize it before discharging them.",
        });
      }
      if (!finalized) {
        return res.status(409).json({
          code: "INVOICE_NOT_FINALIZED",
          message: `Invoice ${invoice.invoiceNumber} is still a draft. Finalize it to lock the bill, then discharge.`,
          invoiceId: invoice.id,
        });
      }
    }

    const data = { dischargeStatus };

    if (dischargeStatus === "Admitted") {
      data.status = "Admitted";
      data.dischargeDate = null;
      data.dischargeTime = null;
    } else if (dischargeStatus === "Ready For Discharge") {
      // Flagging someone as ready doesn't end the stay, so no discharge
      // date/time is stamped — that only happens on the real discharge.
      data.status = "Admitted";
    } else {
      data.status = "Discharged";

      const rawDate = dischargeDate || patient.dischargeDate || new Date();
      const parsedDate = new Date(rawDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res
          .status(400)
          .json({ message: "dischargeDate is not a valid date" });
      }

      const admissionMidnight = new Date(patient.admissionDate);
      admissionMidnight.setHours(0, 0, 0, 0);
      if (parsedDate < admissionMidnight) {
        return res.status(400).json({
          message: "Discharge date cannot be before the admission date",
        });
      }

      data.dischargeDate = parsedDate;
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

export async function deletePatient(req, res) {
  try {
    const { id } = req.params;

    const docs = await prisma.iPD_Document.findMany({
      where: { patientId: id },
    });

    // Delete the row first — if that fails the files are still intact.
    await prisma.iPD_Patient.delete({ where: { id } });
    await deleteManyObjectsFromR2(docs.map((d) => d.key).filter(Boolean));

    res.json({ message: "Patient deleted" });
  } catch (err) {
    if (err.code === "P2025")
      return res.status(404).json({ message: "Patient not found" });
    console.error("deletePatient error:", err);
    res.status(500).json({ message: "Failed to delete patient" });
  }
}

// ---------- documents ----------

export async function uploadDocument(req, res) {
  try {
    const { id } = req.params;
    const patient = await prisma.iPD_Patient.findUnique({ where: { id } });
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

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

export async function deleteDocument(req, res) {
  try {
    const { docId } = req.params;
    const doc = await prisma.iPD_Document.findUnique({ where: { id: docId } });
    if (!doc) return res.status(404).json({ message: "Document not found" });

    await prisma.iPD_Document.delete({ where: { id: docId } });
    if (doc.key) await deleteObjectFromR2(doc.key);

    res.json({ message: "Document deleted" });
  } catch (err) {
    console.error("deleteDocument error:", err);
    res.status(500).json({ message: "Failed to delete document" });
  }
}