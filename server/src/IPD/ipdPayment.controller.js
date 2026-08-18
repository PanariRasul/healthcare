// server/src/IPD/ipdPayment.controller.js
import prisma from "../lib/prisma.js";

const METHOD_VALUES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];

function calcSettlement(totalStay, totalPaid) {
  if (totalPaid <= 0) return "Pending";
  if (totalPaid >= totalStay) return "Fully Paid";
  return "Partially Paid";
}

// Recomputes and persists a patient's totalPaid / balance / settlementStatus
// from the sum of its IPD_Payment rows. Call inside a transaction after any
// payment create/update/delete so the patient record always stays in sync.
async function recalcPatientTotals(tx, patientId) {
  const patient = await tx.iPD_Patient.findUnique({ where: { id: patientId } });
  if (!patient) throw Object.assign(new Error("Patient not found"), { status: 404 });

  const agg = await tx.iPD_Payment.aggregate({
    where: { patientId },
    _sum: { amount: true },
  });
  const totalPaid = agg._sum.amount || 0;
  const balance = Math.max(0, patient.totalStay - totalPaid);
  const settlementStatus = calcSettlement(patient.totalStay, totalPaid);

  return tx.iPD_Patient.update({
    where: { id: patientId },
    data: { totalPaid, balance, settlementStatus },
  });
}

// GET /api/ipd-payments/summary  -> one row per patient, for the Payment List page
export async function listPaymentSummary(req, res) {
  try {
    const { search = "", status = "" } = req.query;

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
        status ? { settlementStatus: status } : {},
      ],
    };

    const patients = await prisma.iPD_Patient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        serialNumber: true,
        name: true,
        admissionDate: true,
        totalStay: true,
        totalPaid: true,
        balance: true,
        settlementStatus: true,
      },
    });

    res.json(patients);
  } catch (err) {
    console.error("listPaymentSummary error:", err);
    res.status(500).json({ message: "Failed to fetch payment summary" });
  }
}

// GET /api/ipd-payments/patient/:patientId -> patient summary + full payment history
export async function getPatientPayments(req, res) {
  try {
    const { patientId } = req.params;

    const patient = await prisma.iPD_Patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        serialNumber: true,
        name: true,
        admissionDate: true,
        totalStay: true,
        totalPaid: true,
        balance: true,
        settlementStatus: true,
      },
    });
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    const payments = await prisma.iPD_Payment.findMany({
      where: { patientId },
      orderBy: { paymentDate: "desc" },
    });

    res.json({ patient, payments });
  } catch (err) {
    console.error("getPatientPayments error:", err);
    res.status(500).json({ message: "Failed to fetch patient payments" });
  }
}

// GET /api/ipd-payments  -> flat list of every payment across all patients (optional ?patientId=)
export async function listAllPayments(req, res) {
  try {
    const { patientId = "" } = req.query;
    const payments = await prisma.iPD_Payment.findMany({
      where: patientId ? { patientId } : {},
      include: { patient: { select: { serialNumber: true, name: true } } },
      orderBy: { paymentDate: "desc" },
    });
    res.json(payments);
  } catch (err) {
    console.error("listAllPayments error:", err);
    res.status(500).json({ message: "Failed to fetch payments" });
  }
}

// POST /api/ipd-payments  -> add a payment
export async function addPayment(req, res) {
  try {
    const { patientId, amount, method, referenceNumber, notes, paymentDate } = req.body;

    if (!patientId) return res.status(400).json({ message: "patientId is required" });

    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "Payment amount must be a positive number" });
    }
    if (!METHOD_VALUES.includes(method)) {
      return res.status(400).json({ message: `method must be one of: ${METHOD_VALUES.join(", ")}` });
    }

    const result = await prisma.$transaction(async (tx) => {
      const patient = await tx.iPD_Patient.findUnique({ where: { id: patientId } });
      if (!patient) throw Object.assign(new Error("Patient not found"), { status: 404 });

      if (amt > patient.balance) {
        throw Object.assign(
          new Error(`Payment amount (₹${amt}) exceeds remaining balance (₹${patient.balance})`),
          { status: 400 }
        );
      }

      const payment = await tx.iPD_Payment.create({
        data: {
          patientId,
          amount: amt,
          method,
          referenceNumber: referenceNumber || null,
          notes: notes || null,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        },
      });

      const updatedPatient = await recalcPatientTotals(tx, patientId);
      return { payment, patient: updatedPatient };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error("addPayment error:", err);
    res.status(500).json({ message: "Failed to add payment" });
  }
}

// PUT /api/ipd-payments/:id  -> update an existing payment
export async function updatePayment(req, res) {
  try {
    const { id } = req.params;
    const { amount, method, referenceNumber, notes, paymentDate } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.iPD_Payment.findUnique({ where: { id } });
      if (!existing) throw Object.assign(new Error("Payment not found"), { status: 404 });

      const patient = await tx.iPD_Patient.findUnique({ where: { id: existing.patientId } });
      if (!patient) throw Object.assign(new Error("Patient not found"), { status: 404 });

      let amt = existing.amount;
      if (amount !== undefined) {
        amt = parseFloat(amount);
        if (!Number.isFinite(amt) || amt <= 0) {
          throw Object.assign(new Error("Payment amount must be a positive number"), { status: 400 });
        }
        // Balance if this payment didn't exist yet, since we're replacing its amount
        const balanceExcludingThis = patient.balance + existing.amount;
        if (amt > balanceExcludingThis) {
          throw Object.assign(
            new Error(`Payment amount (₹${amt}) exceeds remaining balance (₹${balanceExcludingThis})`),
            { status: 400 }
          );
        }
      }

      if (method !== undefined && !METHOD_VALUES.includes(method)) {
        throw Object.assign(new Error(`method must be one of: ${METHOD_VALUES.join(", ")}`), { status: 400 });
      }

      const payment = await tx.iPD_Payment.update({
        where: { id },
        data: {
          amount: amt,
          method: method !== undefined ? method : existing.method,
          referenceNumber: referenceNumber !== undefined ? referenceNumber || null : existing.referenceNumber,
          notes: notes !== undefined ? notes || null : existing.notes,
          paymentDate: paymentDate ? new Date(paymentDate) : existing.paymentDate,
        },
      });

      const updatedPatient = await recalcPatientTotals(tx, existing.patientId);
      return { payment, patient: updatedPatient };
    });

    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error("updatePayment error:", err);
    res.status(500).json({ message: "Failed to update payment" });
  }
}

// DELETE /api/ipd-payments/:id  -> remove a payment (intended for admin use)
export async function deletePayment(req, res) {
  try {
    const { id } = req.params;

    const updatedPatient = await prisma.$transaction(async (tx) => {
      const existing = await tx.iPD_Payment.findUnique({ where: { id } });
      if (!existing) throw Object.assign(new Error("Payment not found"), { status: 404 });

      await tx.iPD_Payment.delete({ where: { id } });
      return recalcPatientTotals(tx, existing.patientId);
    });

    res.json({ message: "Payment deleted", patient: updatedPatient });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error("deletePayment error:", err);
    res.status(500).json({ message: "Failed to delete payment" });
  }
}