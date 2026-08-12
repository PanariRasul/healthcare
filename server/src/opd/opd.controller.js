// server/src/opd/opd.controller.js
import prisma from "../lib/prisma.js";
import { toDbPatient, fromDbPatient } from "./opd.mappers.js";

// GET /api/opd/patients?search=&page=&limit=
// If neither `page` nor `limit` is provided, returns the FULL patient list
// (no pagination) — the frontend pages currently filter/paginate client-side
// against the complete array, same as they did with dummy data.
export async function listPatients(req, res) {
  try {
    const { search = "", page, limit } = req.query;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { place: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    if (!page && !limit) {
      const patients = await prisma.oPDPatient.findMany({
        where,
        orderBy: { tokenNumber: "asc" },
      });
      return res.status(200).json({ patients: patients.map(fromDbPatient) });
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 1000);

    const [patients, total] = await Promise.all([
      prisma.oPDPatient.findMany({
        where,
        orderBy: { tokenNumber: "asc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.oPDPatient.count({ where }),
    ]);

    return res.status(200).json({
      patients: patients.map(fromDbPatient),
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("List OPD patients error:", err);
    return res.status(500).json({ message: "Could not fetch patients." });
  }
}

// GET /api/opd/patients/followups
// Anyone with an actual follow-up date set, soonest first.
export async function listFollowUps(req, res) {
  try {
    const patients = await prisma.oPDPatient.findMany({
      where: { followUpDate: { not: null } },
      orderBy: { followUpDate: "asc" },
    });
    return res.status(200).json({ patients: patients.map(fromDbPatient) });
  } catch (err) {
    console.error("List OPD follow-ups error:", err);
    return res.status(500).json({ message: "Could not fetch follow-ups." });
  }
}

// GET /api/opd/patients/stats  (for the OPD dashboard — Doctor + Receptionist)
// IMPORTANT: must be registered before "/:id" in the routes file, same
// reason as /followups above.
export async function getStats(req, res) {
  try {
    const todayStr = new Date().toISOString().split("T")[0];

    const [allPatients, followUps] = await Promise.all([
      prisma.oPDPatient.findMany({ orderBy: { visitDate: "desc" } }),
      prisma.oPDPatient.findMany({ where: { followUpDate: { not: null } } }),
    ]);

    const isToday = (p) => p.visitDate.toISOString().split("T")[0] === todayStr;

    const seenToday = allPatients.filter(isToday).length;
    const pendingFollowUps = followUps.filter((f) => f.followUpStatus === "PENDING").length;
    const criticalPatients = allPatients.filter((p) => p.condition === "CRITICAL");

    const totalRevenue = allPatients.reduce((s, p) => s + p.total, 0);
    const todayRevenue = allPatients.filter(isToday).reduce((s, p) => s + p.total, 0);
    const todayCash = allPatients.filter(isToday).reduce((s, p) => s + p.cash, 0);
    const todayUpi = allPatients.filter(isToday).reduce((s, p) => s + p.upi, 0);

    return res.status(200).json({
      totalPatients: allPatients.length,
      seenToday,
      pendingFollowUps,
      criticalCount: criticalPatients.length,
      totalRevenue,
      todayRevenue,
      todayCash,
      todayUpi,
      recentPatients: allPatients.slice(0, 5).map(fromDbPatient),
      criticalPatients: criticalPatients.slice(0, 5).map(fromDbPatient),
    });
  } catch (err) {
    console.error("Get OPD stats error:", err);
    return res.status(500).json({ message: "Could not fetch OPD stats." });
  }
}

// GET /api/opd/patients/:id
export async function getPatient(req, res) {
  try {
    const patient = await prisma.oPDPatient.findUnique({
      where: { id: req.params.id },
      include: { prescribedMedicines: { include: { medicine: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!patient) return res.status(404).json({ message: "Patient not found." });
    return res.status(200).json({ patient: fromDbPatient(patient) });
  } catch (err) {
    console.error("Get OPD patient error:", err);
    return res.status(500).json({ message: "Could not fetch patient." });
  }
}

// POST /api/opd/patients
export async function createPatient(req, res) {
  try {
    const { name, age, gender, visitDate } = req.body;
    if (!name || !age || !gender || !visitDate) {
      return res.status(400).json({
        message: "name, age, gender, and visitDate are required.",
      });
    }

    const data = toDbPatient(req.body);
    const patient = await prisma.oPDPatient.create({ data });

    return res.status(201).json({ patient: fromDbPatient(patient) });
  } catch (err) {
    console.error("Create OPD patient error:", err);
    return res.status(500).json({ message: "Could not register patient." });
  }
}

// PUT /api/opd/patients/:id
export async function updatePatient(req, res) {
  try {
    const existing = await prisma.oPDPatient.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Patient not found." });

    const data = toDbPatient(req.body);
    const patient = await prisma.oPDPatient.update({
      where: { id: req.params.id },
      data,
    });

    return res.status(200).json({ patient: fromDbPatient(patient) });
  } catch (err) {
    console.error("Update OPD patient error:", err);
    return res.status(500).json({ message: "Could not update patient." });
  }
}

// DELETE /api/opd/patients/:id
export async function deletePatient(req, res) {
  try {
    const existing = await prisma.oPDPatient.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Patient not found." });

    await prisma.oPDPatient.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: "Patient deleted." });
  } catch (err) {
    console.error("Delete OPD patient error:", err);
    return res.status(500).json({ message: "Could not delete patient." });
  }
}

// POST /api/opd/patients/:id/prescriptions
// Body: { medicineId, quantity, dosageInstructions }
// Adds a structured prescription line AND immediately reduces the medicine's
// stock — blocking entirely if there isn't enough, with an exact reason so
// staff know precisely how much to restock.
export async function createPrescription(req, res) {
  try {
    const { medicineId, quantity, dosageInstructions } = req.body;

    const qty = parseInt(quantity, 10);
    if (!medicineId || !qty || qty <= 0) {
      return res.status(400).json({ message: "medicineId and a positive quantity are required." });
    }

    const patient = await prisma.oPDPatient.findUnique({ where: { id: req.params.id } });
    if (!patient) return res.status(404).json({ message: "Patient not found." });

    const medicine = await prisma.medicine.findUnique({ where: { id: medicineId } });
    if (!medicine) return res.status(404).json({ message: "Medicine not found." });

    if (qty > medicine.quantity) {
      return res.status(400).json({
        message: `Only ${medicine.quantity} unit(s) of ${medicine.drugName} left, but ${qty} were requested. Please restock before prescribing.`,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const prescribed = await tx.prescribedMedicine.create({
        data: {
          opdPatientId: req.params.id,
          medicineId,
          quantity: qty,
          dosageInstructions: dosageInstructions || null,
        },
      });

      await tx.medicine.update({
        where: { id: medicineId },
        data: { quantity: medicine.quantity - qty },
      });

      await tx.stockHistory.create({
        data: {
          medicineId,
          date: new Date(),
          action: "REDUCE",
          quantity: -qty,
          reason: `Dispensed for OPD patient ${patient.name} (Token OPD-${String(patient.tokenNumber).padStart(3, "0")})`,
        },
      });

      return tx.oPDPatient.findUnique({
        where: { id: req.params.id },
        include: { prescribedMedicines: { include: { medicine: true }, orderBy: { createdAt: "asc" } } },
      });
    });

    return res.status(201).json({ patient: fromDbPatient(result) });
  } catch (err) {
    console.error("Create prescription error:", err);
    return res.status(500).json({ message: "Could not add prescribed medicine." });
  }
}

// POST /api/opd/patients/:id/move-to-ipd
// Admits an OPD patient into IPD. Carries over demographics, follow-up /
// condition tracking, and any prescribed medicines onto a brand-new
// IPD_Patient row, then removes the OPD record — this is a MOVE, not a
// copy, so the patient shows up in the IPD directory instead of OPD from
// here on. Wrapped in a transaction so a failure never leaves the patient
// duplicated in both modules or missing from both.
export async function moveToIPD(req, res) {
  try {
    const opdPatient = await prisma.oPDPatient.findUnique({
      where: { id: req.params.id },
      include: { prescribedMedicines: { include: { medicine: true } } },
    });
    if (!opdPatient) return res.status(404).json({ message: "Patient not found." });

    const { admissionDate, admissionTime } = req.body;
    const genderMap = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

    const notesParts = [
      `Transferred from OPD (Token OPD-${String(opdPatient.tokenNumber).padStart(3, "0")})`,
    ];
    if (opdPatient.diagnosis) notesParts.push(`Diagnosis: ${opdPatient.diagnosis}`);
    if (opdPatient.prescription) notesParts.push(`Prescription: ${opdPatient.prescription}`);
    if (opdPatient.doctorNotes) notesParts.push(`Doctor Notes: ${opdPatient.doctorNotes}`);
    if (opdPatient.notes) notesParts.push(opdPatient.notes);

    const ipdPatient = await prisma.$transaction(async (tx) => {
      const last = await tx.iPD_Patient.findFirst({
        orderBy: { createdAt: "desc" },
        select: { serialNumber: true },
      });
      const lastNum = last?.serialNumber
        ? parseInt(last.serialNumber.replace("IPD-", "")) || 0
        : 0;
      const serialNumber = `IPD-${String(lastNum + 1).padStart(3, "0")}`;

      const created = await tx.iPD_Patient.create({
        data: {
          serialNumber,
          name: opdPatient.name,
          age: opdPatient.age,
          gender: genderMap[opdPatient.gender] || "Other",
          phone: opdPatient.phone || null,
          fromOPD: true,

          admissionDate: admissionDate ? new Date(admissionDate) : new Date(),
          admissionTime:
            admissionTime ||
            new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),

          notes: notesParts.join(" | "),

          // Same enum types on both models, so these carry over as-is.
          followUpDate: opdPatient.followUpDate,
          condition: opdPatient.condition,
          followUpDesc: opdPatient.followUpDesc,
          followUpStatus: opdPatient.followUpStatus,
          reminderEnabled: opdPatient.reminderEnabled,
          reminderStatus: opdPatient.reminderStatus,
          reminderSentDate: opdPatient.reminderSentDate,

          medicines: {
            create: (opdPatient.prescribedMedicines || []).map((pm) => ({
              medicineId: pm.medicineId,
              name: pm.medicine?.drugName || "Unknown",
              quantity: pm.quantity,
              unit: "Tablets",
              instructions: pm.dosageInstructions || null,
            })),
          },
        },
        include: {
          dailyCharges: true,
          medicines: true,
          additionalCharges: true,
          documents: true,
        },
      });

      await tx.oPDPatient.delete({ where: { id: opdPatient.id } });

      return created;
    });

    return res.status(201).json({ patient: ipdPatient });
  } catch (err) {
    console.error("Move OPD to IPD error:", err);
    return res.status(500).json({ message: "Could not move patient to IPD." });
  }
}

// DELETE /api/opd/patients/:id/prescriptions/:itemId
// Deletes the record only — does NOT restore stock. If tablets weren't
// actually dispensed, stock must be corrected manually via Pharmacy's
// Add Stock action (kept intentionally separate to avoid silent inventory drift).
export async function deletePrescription(req, res) {
  try {
    const existing = await prisma.prescribedMedicine.findUnique({ where: { id: req.params.itemId } });
    if (!existing || existing.opdPatientId !== req.params.id) {
      return res.status(404).json({ message: "Prescribed medicine record not found." });
    }

    await prisma.prescribedMedicine.delete({ where: { id: req.params.itemId } });
    return res.status(200).json({ message: "Prescription record deleted. Stock was not restored." });
  } catch (err) {
    console.error("Delete prescription error:", err);
    return res.status(500).json({ message: "Could not delete prescription record." });
  }
}