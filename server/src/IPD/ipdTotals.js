// server/src/IPD/ipdTotals.js
//
// THE ONE DEFINITION OF WHAT A PATIENT HAS PAID
//
// Money reaches an IPD patient through two doors, and until now each one
// overwrote the other:
//
//   1. The admission form's Deposit / Cash / UPI / Card boxes. These live
//      as columns on IPD_Patient. ipd.controller used to set
//      totalPaid = deposit + cash + upi + card.
//
//   2. The Payments screen, which writes IPD_Payment ledger rows.
//      ipdPayment.controller used to set totalPaid = SUM(IPD_Payment).
//
// Whichever ran last won. Recording one ledger payment erased every
// advance on the admission form; re-saving the admission form erased every
// ledger payment. It also produced the error this module was written to
// fix: raising Deposit to ₹4,000 on the edit form left totalPaid stuck at
// ₹3,000, so a legitimate ₹1,000 refund was rejected with "the patient has
// paid ₹3,000".
//
// Both doors are real money, so they ADD:
//
//   totalPaid = (deposit + cash + upi + card) + SUM(IPD_Payment.amount)
//
// Everything downstream — balance, settlement status, the refund cap, the
// "Pending" column on the patient list — is derived from that one figure,
// here, so the two controllers can never disagree again.

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function calcSettlement(totalStay, netPaid) {
  const stay = round2(totalStay);
  const paid = round2(netPaid);
  if (paid <= 0) return "Pending";
  if (paid > stay) return "Overpaid"; // patient has a credit balance
  if (paid === stay) return "Fully Paid";
  return "Partially Paid";
}

// Advances entered on the admission form itself.
export function sumAdvances({ deposit, cash, upi, card }) {
  return round2(
    (Number(deposit) || 0) +
      (Number(cash) || 0) +
      (Number(upi) || 0) +
      (Number(card) || 0),
  );
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

// THE REFUND RULE
//   A refund is only ever the return of an OVERPAYMENT — money the patient
//   handed over above the bill:
//
//     refundable = max(0, totalPaid − totalStay)
//
//   Deposit ₹10,000 against a ₹5,000 bill leaves ₹5,000 to return. Paid
//   ₹3,000 against a ₹3,000 bill leaves nothing.
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
  const refund = Math.min(refundableAmount(stay, paid), Math.max(0, round2(refundAmount)));
  const netPaid = round2(paid - refund);

  return {
    totalPaid: paid,
    refundAmount: refund,
    netPaid,
    balance: round2(stay - netPaid),
    settlementStatus: calcSettlement(stay, netPaid),
  };
}

// Recomputes and persists totalPaid / balance / settlementStatus for one
// patient from BOTH sources. Call inside a transaction after anything that
// touches payments or charges.
//
// `overrides` lets a caller supply figures that are being written in the
// same transaction and so aren't in the database yet — the admission form
// passing its new deposit/cash/upi/card and totalStay, for example.
export async function recalcPatientTotals(tx, patientId, overrides = {}) {
  const patient = await tx.iPD_Patient.findUnique({ where: { id: patientId } });
  if (!patient) {
    throw Object.assign(new Error("Patient not found"), { status: 404 });
  }

  const advances = sumAdvances({
    deposit: overrides.deposit ?? patient.deposit,
    cash: overrides.cash ?? patient.cash,
    upi: overrides.upi ?? patient.upi,
    card: overrides.card ?? patient.card,
  });
  const ledger = await sumLedger(tx, patientId);

  const totals = deriveTotals({
    totalStay: overrides.totalStay ?? patient.totalStay,
    totalPaid: round2(advances + ledger),
    refundAmount: overrides.refundAmount ?? patient.refundAmount ?? 0,
  });

  return tx.iPD_Patient.update({
    where: { id: patientId },
    data: {
      totalPaid: totals.totalPaid,
      refundAmount: totals.refundAmount,
      balance: totals.balance,
      settlementStatus: totals.settlementStatus,
    },
  });
}