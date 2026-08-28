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

  const totalPaid = round2(
    typeof existingTotalPaid === "number" ? existingTotalPaid : enteredPaid,
  );

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
      toDate: c.toDate ? new Date(c.toDate) : null,
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
      // --- NEW FIELDS MAPPED HERE ---
      amountPaid: toNum(c.amountPaid),
      paymentDate: c.paymentDate ? new Date(c.paymentDate) : null,
      paymentStatus: c.paymentStatus || "Pending",
    })),
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

    const { flat, dailyCharges, medicines, additionalCharges } =
      buildPatientData(req.body, { existingTotalPaid: existing.totalPaid });

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

            dailyCharges: {
              create: dailyCharges,
            },

            medicines: {
              create: medicines,
            },
          },
        });

        // --- NEW FIELDS MAPPED HERE FOR UPDATES ---
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
      data.status = "Admitted";
      data.dischargeDate = null;
      data.dischargeTime = null;
    } else {
      data.status =
        dischargeStatus === "Discharged" ? "Discharged" : "Admitted";

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
    await deleteManyObjectsFromR2(docs.map((d) => d.key));

    await prisma.iPD_Patient.delete({ where: { id } });
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

    await deleteObjectFromR2(doc.key);
    await prisma.iPD_Document.delete({ where: { id: docId } });

    res.json({ message: "Document deleted" });
  } catch (err) {
    console.error("deleteDocument error:", err);
    res.status(500).json({ message: "Failed to delete document" });
  }
}
