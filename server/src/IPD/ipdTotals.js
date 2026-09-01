// server/src/IPD/ipdTotals.js
//
// THE ONE DEFINITION OF WHAT A PATIENT HAS PAID
//
//   totalPaid = SUM(IPD_Payment.amount)
//
// Every rupee a patient hands over is a row in the IPD_Payment ledger, with
// its own amount, date and mode. Both doors write there:
//
//   1. The admission form's "Payments Received" list.
//   2. The Payments screen.
//
// It used to be split. The admission form held four flat columns
// (deposit / cash / upi / card) and set totalPaid = their sum; the Payments
// screen set totalPaid = SUM(IPD_Payment). Whichever ran last won, so
// recording one ledger payment erased every advance on the form and
// vice-versa. Editing the Deposit box from ₹3,000 to ₹4,000 left totalPaid
// stuck at ₹3,000 and a legitimate ₹1,000 refund was rejected.
//
// The four columns still exist, but they are now DERIVED from the ledger —
// see legacyPaymentColumns below — purely so the dashboard tiles and stats
// keep working. Nothing reads them to decide what a patient has paid.
//
// Everything downstream — balance, settlement status, the refund cap, the
// "Pending" column on the patient list — comes from totalPaid, computed
// here, so no two callers can disagree again.

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Mirrors the PaymentMethod enum in schema.prisma.
export const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];

// Display labels for the UI and printed invoices.
export const METHOD_LABELS = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

export function calcSettlement(totalStay, netPaid) {
  const stay = round2(totalStay);
  const paid = round2(netPaid);
  if (paid <= 0) return "Pending";
  if (paid > stay) return "Overpaid"; // patient has a credit balance
  if (paid === stay) return "Fully Paid";
  return "Partially Paid";
}

// Total of the IPD_Payment ledger for one patient. `tx` may be the Prisma
// client or a transaction client.
export async function sumLedger(tx, patientId) {
  const agg = await tx.iPD_Payment.aggregate({
    where: { patientId },
    _sum: { amount: true },
  });
  return round2(agg._sum.amount || 0);
}

// Rebuilds the legacy deposit / cash / upi / card columns from a list of
// payments, so the dashboard and the payment tiles on Patient Details keep
// showing sensible figures.
//
//   deposit = everything collected
//   cash / upi / card = that same total split by mode
//
// deposit deliberately overlaps the other three; it is the whole, not a
// fourth mode. Never sum all four to get what a patient paid — that would
// double-count. Use totalPaid.
export function legacyPaymentColumns(payments = []) {
  const byMethod = (m) =>
    round2(
      payments
        .filter((p) => p.method === m)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0),
    );

  return {
    deposit: round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)),
    cash: byMethod("CASH"),
    upi: byMethod("UPI"),
    card: byMethod("CARD"),
  };
}

// THE REFUND RULE
//   A refund is only ever the return of an OVERPAYMENT — money the patient
//   handed over above the bill:
//
//     refundable = max(0, totalPaid − totalStay)
//
//   Deposits totalling ₹10,000 against a ₹5,000 bill leave ₹5,000 to
//   return. ₹3,000 against a ₹3,000 bill leaves nothing.
//
//   Anything more would be the clinic handing back its own money, and it
//   shows on the patient list as "Pending" that the patient doesn't owe.
export function refundableAmount(totalStay, totalPaid) {
  return round2(Math.max(0, round2(totalPaid) - round2(totalStay)));
}

const inr = (n) => `₹${round2(n).toLocaleString("en-IN")}`;

// Returns an error message, or null when the refund is allowed.
export function checkRefund(totalStay, totalPaid, requested) {
  const cap = refundableAmount(totalStay, totalPaid);
  if (round2(requested) <= cap) return null;
  if (cap === 0) {
    return `There is nothing to refund. The bill is ${inr(totalStay)} and the patient has paid ${inr(totalPaid)} — a refund only applies when they have paid more than the bill.`;
  }
  return `The refund can be at most ${inr(cap)}. The bill is ${inr(totalStay)} and the patient has paid ${inr(totalPaid)}, so only the ${inr(cap)} paid above the bill can go back.`;
}

// Derives balance and settlement from a bill, a total paid, and a refund.
//
//   netPaid = totalPaid − refund
//   balance = totalStay − netPaid
//
// A negative balance is a credit the patient still has on file — it is
// deliberately NOT clamped to zero, because that credit carries forward
// against future charges. With the refund capped at the overpayment, a
// refund can never push the balance above totalStay − totalPaid.
export function deriveTotals({ totalStay, totalPaid, refundAmount = 0 }) {
  const stay = round2(totalStay);
  const paid = round2(totalPaid);
  const refund = Math.min(
    refundableAmount(stay, paid),
    Math.max(0, round2(refundAmount)),
  );
  const netPaid = round2(paid - refund);

  return {
    totalPaid: paid,
    refundAmount: refund,
    netPaid,
    balance: round2(stay - netPaid),
    settlementStatus: calcSettlement(stay, netPaid),
  };
}

// Recomputes and persists totalPaid, the legacy mode columns, balance and
// settlementStatus for one patient, from the ledger. Call inside a
// transaction after anything that touches payments or charges.
//
// `overrides` lets a caller supply figures being written in the same
// transaction that aren't in the database yet — the admission form passing
// its new totalStay, for example.
export async function recalcPatientTotals(tx, patientId, overrides = {}) {
  const patient = await tx.iPD_Patient.findUnique({ where: { id: patientId } });
  if (!patient) {
    throw Object.assign(new Error("Patient not found"), { status: 404 });
  }

  const payments = await tx.iPD_Payment.findMany({
    where: { patientId },
    select: { amount: true, method: true },
  });

  const totals = deriveTotals({
    totalStay: overrides.totalStay ?? patient.totalStay,
    totalPaid: round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)),
    refundAmount: overrides.refundAmount ?? patient.refundAmount ?? 0,
  });

  return tx.iPD_Patient.update({
    where: { id: patientId },
    data: {
      ...legacyPaymentColumns(payments),
      totalPaid: totals.totalPaid,
      refundAmount: totals.refundAmount,
      balance: totals.balance,
      settlementStatus: totals.settlementStatus,
    },
  });
}

// Normalises one payment row off a request body. Returns null for a row
// with no usable amount, so blank rows left in the form are simply dropped.
export function normalisePayment(row) {
  const amount = round2(row?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const method = PAYMENT_METHODS.includes(row.method) ? row.method : "CASH";
  let date = row.paymentDate ? new Date(row.paymentDate) : null;
  if (!date || Number.isNaN(date.getTime())) date = new Date();

  return {
    id: row.id || null,
    amount,
    method,
    // Only meaningful for OTHER; cleared otherwise so a leftover label from
    // switching the dropdown can't linger on the record.
    methodOther:
      method === "OTHER" ? row.methodOther?.trim().slice(0, 100) || null : null,
    referenceNumber: row.referenceNumber?.trim().slice(0, 100) || null,
    notes: row.notes?.trim().slice(0, 500) || null,
    paymentDate: date,
  };
}

// How a payment's mode should read on screen and on a printed bill.
export function methodLabel(payment) {
  if (!payment) return "";
  if (payment.method === "OTHER") return payment.methodOther || "Other";
  return METHOD_LABELS[payment.method] || payment.method || "";
}