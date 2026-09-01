// client/src/lib/invoiceLines.js
//
// Turns a patient record into invoice line items. Shared by the editable
// InvoiceModal and the read-only ProformaInvoiceModal so both always price a
// patient the same way — previously this logic lived in the invoice modal
// only, and any preview built elsewhere would have drifted from it.

import { fmtDate } from "./dateFormat";

// Values match the PaymentMethod enum in schema.prisma.
const METHOD_LABELS = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

/** How a payment's mode should read on screen and on a printed bill. */
export function methodLabel(payment) {
  if (!payment) return "";
  if (payment.method === "OTHER") return payment.methodOther || "Other";
  return METHOD_LABELS[payment.method] || payment.method || "";
}

/**
 * Normalises a patient's or an invoice's payment rows into what the bill
 * prints: one dated line per payment, oldest first, blanks dropped.
 */
export function buildPaymentRows(payments = []) {
  return (Array.isArray(payments) ? payments : [])
    .map((pm, i) => ({
      key: pm.id || `pm-${i}`,
      amount: Number(pm.amount) || 0,
      paymentDate: pm.paymentDate || null,
      label: methodLabel(pm),
      referenceNumber: pm.referenceNumber || "",
    }))
    .filter((pm) => pm.amount > 0)
    .sort((a, b) => new Date(a.paymentDate || 0) - new Date(b.paymentDate || 0));
}

/** Total of a set of payment rows. */
export function sumPayments(payments = []) {
  return (
    Math.round(
      buildPaymentRows(payments).reduce((s, pm) => s + pm.amount, 0) * 100,
    ) / 100
  );
}

let seq = 0;
export const nextLineId = () => `line-${Date.now()}-${seq++}`;

const num = (v) => Number(v) || 0;

/**
 * @param {object} data     full patient record (IPD or OPD shape)
 * @param {"IPD"|"OPD"} type
 * @returns {Array<{id, description, qty, rate}>}
 */
export function buildLineItems(data, type) {
  const items = [];
  if (!data) return items;

  if (type === "IPD") {
    // --- Per-day bed / treatment charges ---
    (data.dailyCharges || []).forEach((c) => {
      const from = fmtDate(c.date, "");
      const to = fmtDate(c.toDate, "");
      const period = from ? ` — ${from}${to ? ` to ${to}` : " onwards"}` : "";
      items.push({
        id: nextLineId(),
        description: `Per-Day Bed / Treatment Charges${period}`,
        qty: c.days || 1,
        rate: num(c.rate),
      });
    });

    // --- Additional charges, net of anything already settled ---
    (data.additionalCharges || []).forEach((c) => {
      const isPerDay = c.chargeType === "PER_DAY";
      const gross = isPerDay ? (c.days || 1) * num(c.rate) : num(c.rate);
      const paidAmt = num(c.amountPaid);
      const pending = Math.max(0, gross - paidAmt);
      const dateStr = c.paymentDate ? fmtDate(c.paymentDate, "") : "";

      const baseDesc = isPerDay
        ? `${c.label} (${c.days || 1} day${(c.days || 1) === 1 ? "" : "s"} × ₹${num(c.rate)})`
        : c.label;

      if (c.paymentStatus === "Paid" || (paidAmt >= gross && gross > 0)) {
        // Settled already — listed for the record, billed at zero.
        items.push({
          id: nextLineId(),
          description: `${baseDesc} — paid ₹${paidAmt}${dateStr ? ` on ${dateStr}` : ""}`,
          qty: 1,
          rate: 0,
        });
      } else if (
        (c.paymentStatus === "Partial Paid" || paidAmt > 0) &&
        pending > 0
      ) {
        // Part-paid — only the outstanding balance is billed.
        items.push({
          id: nextLineId(),
          description: `${baseDesc} — part-paid ₹${paidAmt}${dateStr ? ` on ${dateStr}` : ""} (balance)`,
          qty: 1,
          rate: pending,
        });
      } else {
        items.push({
          id: nextLineId(),
          description: baseDesc,
          qty: isPerDay ? c.days || 1 : 1,
          rate: num(c.rate),
        });
      }
    });

    // --- Medicines dispensed on the ward ---
    (data.medicines || []).forEach((m) => {
      items.push({
        id: nextLineId(),
        description: `${m.name}${m.dosage ? ` (${m.dosage})` : ""}`,
        qty: m.quantity || 1,
        rate: num(m.medicine?.sellingPrice),
      });
    });

    return items;
  }

  // --- OPD ---
  // `fee` is the legacy consultation field and is 0 on every record created
  // since it was dropped from the registration form. Falling back to what
  // was actually collected keeps a consult-only patient from being billed ₹0.
  const consultAmount =
    num(data.fee) || num(data.total) || num(data.cash) + num(data.upi);
  if (consultAmount > 0) {
    items.push({
      id: nextLineId(),
      description: "OPD Consultation Fee",
      qty: 1,
      rate: consultAmount,
    });
  }

  (data.prescribedMedicines || []).forEach((pm) => {
    items.push({
      id: nextLineId(),
      description: `${pm.drugName}${pm.dosageInstructions ? ` (${pm.dosageInstructions})` : ""}`,
      qty: pm.quantity || 1,
      rate: num(pm.sellingPrice),
    });
  });

  return items;
}

/**
 * Totals for a set of line items, applying the refund rule:
 * money handed back to the patient increases what's still owed.
 */
export function calcTotals({
  lineItems = [],
  discount = 0,
  gstPercent = 0,
  paid = 0,
  refundAmount = 0,
}) {
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  const subtotal = round2(
    lineItems.reduce((s, r) => s + num(r.qty) * num(r.rate), 0),
  );
  const discountVal = num(discount);
  const taxableBase = Math.max(0, subtotal - discountVal);
  const gstAmount = round2((taxableBase * num(gstPercent)) / 100);
  const grandTotal = round2(taxableBase + gstAmount);
  const paidVal = num(paid);
  const refundVal = Math.max(0, num(refundAmount));
  const netPaid = round2(paidVal - refundVal);
  const balance = round2(grandTotal - netPaid);

  return {
    subtotal,
    discountVal,
    gstAmount,
    grandTotal,
    paidVal,
    refundVal,
    netPaid,
    balance,
    // What the clinic is holding above the bill — the natural refund figure.
    refundable: round2(Math.max(0, paidVal - grandTotal)),
  };
}