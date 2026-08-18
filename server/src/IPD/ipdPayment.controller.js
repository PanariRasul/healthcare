// server/src/IPD/ipdPayment.controller.js
import prisma from "../lib/prisma.js";

const METHOD_VALUES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];

// Money is stored as Float, so plain subtraction can leave tiny binary
// rounding artifacts (e.g. 21499.999999999996). Round everything we persist
// or compare to 2 decimal places so the UI never shows "junk" paise.
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Guards against a fat-fingered payment amount (e.g. an extra zero) slipping
// through as a valid, unbounded number. Generous enough to never block a
// real hospital bill, but catches obvious data-entry mistakes.
const MAX_PAYMENT_AMOUNT = 1_00_00_000; // ₹1 crore

// Optional free-text fields (reference number, notes) — trim whitespace and
// cap length so the API can't be used to stuff arbitrarily large blobs into
// the database.
const sanitizeText = (value, maxLen = 300) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
};

// Parses an optional date input; returns `fallback` for missing/blank input
// and throws a 400 for a value that was supplied but isn't a valid date,
// instead of silently persisting "Invalid Date".
const parseOptionalDate = (input, fallback) => {
  if (input === undefined || input === null || input === "") return fallback;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error("paymentDate is not a valid date"), { status: 400 });
  }
  return date;
};

function calcSettlement(totalStay, totalPaid) {
  const stay = round2(totalStay);
  const paid = round2(totalPaid);
  if (paid <= 0) return "Pending";
  if (paid > stay) return "Overpaid"; // patient has a credit balance
  if (paid === stay) return "Fully Paid";
  return "Partially Paid";
}

// Recomputes and persists a patient's totalPaid / balance / settlementStatus
// from the sum of its IPD_Payment rows. Call inside a transaction after any
// payment create/update/delete so the patient record always stays in sync.
//
// NOTE: overpayments are allowed (see addPayment/updatePayment — the old
// "amount can't exceed balance" guard was removed). That means `balance`
// can go negative here, representing a credit/advance the patient has on
// file. We intentionally do NOT clamp it to 0 anymore: a negative balance
// is what lets that credit get carried forward and auto-adjusted against
// future charges (e.g. additional charges / next billing cycle raising
// totalStay). Clamping to 0 would silently erase that credit.
async function recalcPatientTotals(tx, patientId) {
  const patient = await tx.iPD_Patient.findUnique({ where: { id: patientId } });
  if (!patient) throw Object.assign(new Error("Patient not found"), { status: 404 });

  const agg = await tx.iPD_Payment.aggregate({
    where: { patientId },
    _sum: { amount: true },
  });
  const totalPaid = round2(agg._sum.amount || 0);
  const balance = round2(patient.totalStay - totalPaid); // can be negative = credit/advance
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

    const amt = round2(parseFloat(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "Payment amount must be a positive number" });
    }
    if (amt > MAX_PAYMENT_AMOUNT) {
      return res.status(400).json({
        message: `Payment amount looks too large (max ₹${MAX_PAYMENT_AMOUNT.toLocaleString("en-IN")} per transaction). Double-check the amount.`,
      });
    }
    if (!METHOD_VALUES.includes(method)) {
      return res.status(400).json({ message: `method must be one of: ${METHOD_VALUES.join(", ")}` });
    }

    const result = await prisma.$transaction(async (tx) => {
      const patient = await tx.iPD_Patient.findUnique({ where: { id: patientId } });
      if (!patient) throw Object.assign(new Error("Patient not found"), { status: 404 });

      // Overpayment is allowed on purpose — reception may collect more than
      // the current balance (e.g. patient paying ahead). The excess shows
      // up as a negative balance (credit) and is auto-adjusted against
      // future charges/billing instead of being rejected here.
      const overpaidBy = amt > patient.balance ? round2(amt - patient.balance) : 0;

      const payment = await tx.iPD_Payment.create({
        data: {
          patientId,
          amount: amt,
          method,
          referenceNumber: sanitizeText(referenceNumber, 100),
          notes: sanitizeText(notes, 500),
          paymentDate: parseOptionalDate(paymentDate, new Date()),
        },
      });

      const updatedPatient = await recalcPatientTotals(tx, patientId);
      return { payment, patient: updatedPatient, overpaidBy };
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
        amt = round2(parseFloat(amount));
        if (!Number.isFinite(amt) || amt <= 0) {
          throw Object.assign(new Error("Payment amount must be a positive number"), { status: 400 });
        }
        if (amt > MAX_PAYMENT_AMOUNT) {
          throw Object.assign(
            new Error(`Payment amount looks too large (max ₹${MAX_PAYMENT_AMOUNT.toLocaleString("en-IN")} per transaction). Double-check the amount.`),
            { status: 400 }
          );
        }
        // Overpayment is allowed here too, same as addPayment — no cap
        // against the remaining balance.
      }

      if (method !== undefined && !METHOD_VALUES.includes(method)) {
        throw Object.assign(new Error(`method must be one of: ${METHOD_VALUES.join(", ")}`), { status: 400 });
      }

      const payment = await tx.iPD_Payment.update({
        where: { id },
        data: {
          amount: amt,
          method: method !== undefined ? method : existing.method,
          referenceNumber:
            referenceNumber !== undefined ? sanitizeText(referenceNumber, 100) : existing.referenceNumber,
          notes: notes !== undefined ? sanitizeText(notes, 500) : existing.notes,
          paymentDate: parseOptionalDate(paymentDate, existing.paymentDate),
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