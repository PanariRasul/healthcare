// server/src/Invoice/invoice.controller.js
import prisma from "../lib/prisma.js";
import { randomUUID } from "crypto";

const TYPE_VALUES = ["OPD", "IPD", "PHARMACY"];
const PREFIX = "VPC"; // clinic prefix — change here if the clinic name changes

// Types that are limited to ONE invoice per patient. A PHARMACY sale can
// repeat for the same person as often as they buy medicine, so it's excluded.
const SINGLE_INVOICE_TYPES = ["OPD", "IPD"];

const STATUS_DRAFT = "DRAFT";
const STATUS_FINALIZED = "FINALIZED";

// Accepted values for a recorded payment's method. Kept permissive on read
// (an older row with something else still displays) but validated on write.
const PAYMENT_METHOD_VALUES = [
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Cheque",
  "Other",
];

// Catches a fat-fingered amount (an extra zero) without ever blocking a real
// bill. Same ceiling the IPD payments module uses.
const MAX_PAYMENT_AMOUNT = 1_00_00_000; // ₹1 crore

function isValidType(t) {
  return TYPE_VALUES.includes(t);
}

function isSingleInvoiceType(t) {
  return SINGLE_INVOICE_TYPES.includes(t);
}

// Thrown for pharmacy-stock problems hit while saving a PHARMACY invoice
// (missing medicine, not enough stock left). Caught separately so the route
// can answer 400 instead of a generic 500.
class StockError extends Error {}

// Thrown for bad invoice data that the caller can fix (an unparseable line
// date, a negative quantity). Also mapped to a 400, with a message safe to
// show to the user as-is.
class ValidationError extends Error {}

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function parseOptionalDate(input) {
  if (input === undefined || input === null || input === "") return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Field normalisers
// ---------------------------------------------------------------------------

// Normalises a line item's optional dispense date down to "YYYY-MM-DD".
// Rejects a value that was supplied but isn't parseable, rather than letting
// "Invalid Date" reach the database.
function normalizeItemDate(rawDate, label) {
  if (rawDate === undefined || rawDate === null || rawDate === "") return null;
  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError(`"${label}": "${rawDate}" is not a valid date.`);
  }
  return d.toISOString().split("T")[0];
}

// Passes line items through with every field the caller sent left intact,
// adding only a normalised `date`.
//
// `date` is the day THAT line was dispensed. An admitted IPD patient collects
// medicines across many days and is billed once at discharge, so a single
// date on the invoice header can't describe the bill — each line carries its
// own. Optional: a walk-in sale leaves it blank and the invoice date covers
// everything.
//
// Note the spread: this deliberately does NOT rebuild the object from a fixed
// list of known keys, so anything the client stores on a line (category,
// batch, medicineId, returnedQty, and whatever gets added later) survives.
function normalizeLineItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ValidationError("lineItems must be a non-empty array");
  }

  return rawItems.map((raw, idx) => {
    const label = (raw?.description || `Line ${idx + 1}`).toString();
    const qty = toNum(raw?.qty);
    const rate = toNum(raw?.rate);

    if (qty < 0) {
      throw new ValidationError(`"${label}": quantity cannot be negative.`);
    }
    if (rate < 0) {
      throw new ValidationError(`"${label}": rate cannot be negative.`);
    }

    return {
      ...raw,
      date: normalizeItemDate(raw?.date, label),
    };
  });
}

// The invoice's own date. Returns `fallback` when nothing was supplied, so
// callers can default to "now" on create and to "leave it alone" on update.
function normalizeInvoiceDate(rawDate, fallback) {
  if (rawDate === undefined || rawDate === null || rawDate === "") {
    return fallback;
  }
  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError("invoiceDate is not a valid date.");
  }
  return d;
}

// Trims and caps the optional text snapshotted onto an invoice, so the API
// can't be used to push arbitrarily large blobs into the row.
function sanitizeText(value, maxLen = 200) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

// Age is an optional Int; anything non-numeric or outside a sane human range
// is dropped rather than rejected, since it's display-only on the bill.
function sanitizeAge(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || n > 130) return null;
  return n;
}

// The patient details an invoice snapshots at billing time.
//
// Deliberately COPIED onto the invoice rather than joined from the patient
// record: a reprint years later has to show what was on the bill the day it
// was issued, even if the patient has since been edited or deleted.
//
// `patientSource` exists because a pharmacy sale always carries
// patientType "PHARMACY" (that's what drives its own invoice-number series),
// so without this the OPD/IPD origin of the buyer was lost entirely.
//
// Only keys the caller actually sent are returned, so a partial update can't
// blank out details it never mentioned.
function patientDetailFields(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => body?.[k] !== undefined;

  if (!partial || has("patientSource")) {
    const source = sanitizeText(body?.patientSource, 20);
    out.patientSource = ["OPD", "IPD", "WALKIN"].includes(source)
      ? source
      : null;
  }
  if (!partial || has("patientPhone")) {
    out.patientPhone = sanitizeText(body?.patientPhone, 20);
  }
  if (!partial || has("patientAge")) {
    out.patientAge = sanitizeAge(body?.patientAge);
  }
  if (!partial || has("patientGender")) {
    out.patientGender = sanitizeText(body?.patientGender, 20);
  }
  if (!partial || has("doctorName")) {
    out.doctorName = sanitizeText(body?.doctorName, 120);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Part-payments
// ---------------------------------------------------------------------------
// A patient does not have to clear the whole bill at once — they can hand
// over some money now and leave the rest pending, then come back and pay
// more later. `invoice.payments` is the dated list of what was actually
// received; `paid` and `balance` are a rollup of it.
//
// Payments live in the invoice's existing `payments` JSON column rather than
// a separate table, so the printed bill keeps showing exactly the list that
// was snapshotted onto it.

// One stored payment entry, normalised. `id` lets a mis-keyed row be removed
// later without depending on array position.
function normalizePaymentEntry(raw) {
  const amount = round2(toNum(raw?.amount));
  if (amount <= 0) {
    throw new ValidationError("Payment amount must be a positive number.");
  }
  if (amount > MAX_PAYMENT_AMOUNT) {
    throw new ValidationError(
      `Payment amount looks too large (max ₹${MAX_PAYMENT_AMOUNT.toLocaleString(
        "en-IN",
      )} per transaction). Double-check the amount.`,
    );
  }

  const method = raw?.method || "Cash";
  if (!PAYMENT_METHOD_VALUES.includes(method)) {
    throw new ValidationError(
      `method must be one of: ${PAYMENT_METHOD_VALUES.join(", ")}`,
    );
  }

  return {
    id: raw?.id || randomUUID(),
    amount,
    method,
    paymentDate: (
      parseOptionalDate(raw?.paymentDate) || new Date()
    ).toISOString(),
    referenceNumber: sanitizeText(raw?.referenceNumber, 100),
    notes: sanitizeText(raw?.notes, 500),
    receivedById: raw?.receivedById || null,
    receivedByName: sanitizeText(raw?.receivedByName, 120),
  };
}

// Reads an invoice's payments column defensively — it may be absent, null, or
// (on older rows) something other than an array.
function readPayments(invoice) {
  return Array.isArray(invoice?.payments) ? invoice.payments : [];
}

function paymentsTotal(payments) {
  return round2(
    readPayments({ payments }).reduce((sum, p) => sum + toNum(p?.amount), 0),
  );
}

// Invoices saved before part-payments existed carry a `paid` figure with no
// entries behind it. Recomputing from the list alone would silently erase
// that money, so the first time such an invoice gains a payment its existing
// `paid` is materialised as an opening entry.
function withOpeningPayment(invoice) {
  const existing = readPayments(invoice);
  if (existing.length > 0) return existing;
  if (toNum(invoice.paid) <= 0) return existing;

  return [
    {
      id: randomUUID(),
      amount: round2(invoice.paid),
      method: PAYMENT_METHOD_VALUES.includes(invoice.paymentMethod)
        ? invoice.paymentMethod
        : "Cash",
      paymentDate:
        (
          invoice.invoiceDate ||
          invoice.createdAt ||
          new Date()
        ).toISOString?.() || new Date().toISOString(),
      referenceNumber: null,
      notes: "Opening amount recorded when this invoice was created.",
      receivedById: invoice.createdById || null,
      receivedByName: invoice.createdByName || null,
    },
  ];
}

// Re-derives paid/balance from a payment list. Mirrors the refund arithmetic
// in normaliseTotals so the two can never disagree:
//   netPaid = paid − refund,  balance = grandTotal − netPaid
function totalsFromPayments(invoice, payments) {
  const paid = paymentsTotal(payments);
  const refundAmount = round2(toNum(invoice.refundAmount));
  return {
    paid,
    balance: round2(invoice.grandTotal - (paid - refundAmount)),
  };
}

// Applies the pharmacy-stock impact of a PHARMACY invoice's line items —
// dispensing medicine through Pharmacy Billing now actually reduces stock,
// the same way OPD prescriptions and IPD medicines do.
//
// Works on the net difference between `previousItems` (the invoice's line
// items before this save — [] on create) and `newItems` (what's being saved
// now), grouped by medicineId, so editing an existing invoice only moves the
// delta instead of double-deducting. Only line items with a `medicineId`
// (i.e. picked from the pharmacy catalogue, not a free-text line) affect
// stock. Every change is logged to StockHistory.
//
// Must run inside a Prisma transaction (`tx`).
async function applyPharmacyInvoiceStockChanges(
  tx,
  { previousItems = [], newItems = [], contextLabel },
) {
  const deltas = new Map(); // medicineId -> net tablets needed (positive = deduct, negative = restock)

  for (const it of previousItems) {
    if (!it.medicineId) continue;
    deltas.set(
      it.medicineId,
      (deltas.get(it.medicineId) || 0) - (toNum(it.qty) || 0),
    );
  }
  for (const it of newItems) {
    if (!it.medicineId) continue;
    deltas.set(
      it.medicineId,
      (deltas.get(it.medicineId) || 0) + (toNum(it.qty) || 0),
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
        `Only ${med.quantity} unit(s) of "${med.drugName}" are in stock (this invoice needs ${delta} more).`,
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
            ? `Sold via Pharmacy invoice for ${contextLabel}`
            : `Pharmacy invoice edited — stock restored for ${contextLabel}`,
      },
    });
  }
}

// Builds the next sequential invoice number for a given patient type, e.g.
// VPC-INV-OPD-000001, VPC-INV-IPD-000042. Numbering is per-type.
//
// Ordered by invoiceNumber (not createdAt) so a back-dated or imported row
// can't hand out a number that's already taken.
async function generateInvoiceNumber(patientType) {
  const last = await prisma.invoice.findFirst({
    where: { patientType },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  const lastNum = last?.invoiceNumber
    ? parseInt(last.invoiceNumber.split("-").pop(), 10) || 0
    : 0;
  const next = lastNum + 1;
  return `${PREFIX}-INV-${patientType}-${String(next).padStart(6, "0")}`;
}

// Returns the existing OPD/IPD invoice for a patient, or null. Always null
// for PHARMACY, which has no one-per-patient rule.
async function findExistingInvoice(patientType, patientId) {
  if (!isSingleInvoiceType(patientType)) return null;
  return prisma.invoice.findFirst({
    where: { patientType, patientId },
    orderBy: { createdAt: "asc" },
  });
}

// Pulls the totals a caller sent and normalises them.
//
// THE REFUND RULE
//   A refund is only ever the return of an OVERPAYMENT — the money the
//   patient handed over above the bill:
//
//     refundable = max(0, paid − grandTotal)
//
//   Deposit ₹10,000 against a ₹5,000 bill leaves ₹5,000 refundable.
//   Paid ₹5,000 against a ₹5,000 bill leaves nothing to refund.
//
//   The refund is capped at that figure here. Without the cap, refunding
//   more than the overpayment silently manufactures a "balance due" the
//   patient never owed — which is exactly what a ₹15,202 refund against a
//   ₹37,200 bill fully paid was doing.
//
//     netPaid = paid − refund      (always ≥ grandTotal when overpaid)
//     balance = grandTotal − netPaid
//
//   With the cap in place, a refund can never push the balance above
//   grandTotal − paid. A negative balance means the clinic is still
//   holding an advance that hasn't been returned yet.
//
// PART-PAYMENTS
//   When the caller sends a non-empty `payments` list, `paid` is taken from
//   the sum of that list instead of from body.paid. The list is the record of
//   what was actually received, so letting a separate `paid` field disagree
//   with it is how a bill ends up claiming one thing and its payment history
//   another. A caller that sends no list keeps the old behaviour untouched.
function normaliseTotals(body) {
  const subtotal = round2(body.subtotal);
  const discount = round2(body.discount);
  const gstPercent = round2(body.gstPercent);
  const gstAmount = round2(body.gstAmount);
  const grandTotal = round2(body.grandTotal);

  const sentPayments = Array.isArray(body.payments) ? body.payments : [];
  const paid = sentPayments.length
    ? paymentsTotal(sentPayments)
    : round2(body.paid);

  const refundable = round2(Math.max(0, paid - grandTotal));
  // Backstop cap. The IPD controller rejects an over-refund outright with a
  // readable message; this clamp keeps the stored invoice self-consistent
  // even if some other caller sends a bad figure.
  const refundAmount = Math.min(
    refundable,
    Math.max(0, round2(body.refundAmount)),
  );
  const balance = round2(grandTotal - (paid - refundAmount));

  return {
    subtotal,
    discount,
    gstPercent,
    gstAmount,
    grandTotal,
    paid,
    balance,
    refundAmount,
    refundReason: body.refundReason?.trim() || null,
    refundDate: parseOptionalDate(body.refundDate),
    refundMethod: body.refundMethod || null,
  };
}

// GET /api/invoices/next/:patientType -> { invoiceNumber }
// Preview only — does not reserve or persist the number. Used by the
// frontend to display the invoice number before the invoice is saved.
export async function previewNextInvoiceNumber(req, res) {
  try {
    const { patientType } = req.params;
    if (!isValidType(patientType)) {
      return res.status(400).json({
        message: `patientType must be one of: ${TYPE_VALUES.join(", ")}`,
      });
    }
    const invoiceNumber = await generateInvoiceNumber(patientType);
    res.json({ invoiceNumber });
  } catch (err) {
    console.error("previewNextInvoiceNumber error:", err);
    res.status(500).json({ message: "Failed to preview invoice number" });
  }
}

// GET /api/invoices/single/:patientType/:patientId -> { invoice } | { invoice: null }
//
// The one invoice belonging to an OPD/IPD patient. This is what the
// Generate Invoice screen, the proforma preview, and the discharge check
// all read: if it comes back null the patient has no invoice yet, if it
// comes back with status "FINALIZED" the invoice is locked.
export async function getPatientInvoice(req, res) {
  try {
    const { patientType, patientId } = req.params;
    if (!isValidType(patientType)) {
      return res.status(400).json({
        message: `patientType must be one of: ${TYPE_VALUES.join(", ")}`,
      });
    }

    const invoice = await findExistingInvoice(patientType, patientId);
    res.json({ invoice: invoice || null });
  } catch (err) {
    console.error("getPatientInvoice error:", err);
    res.status(500).json({ message: "Failed to fetch invoice" });
  }
}

// GET /api/invoices/patient/:patientType/:patientId -> all invoices for a patient, newest first
export async function listPatientInvoices(req, res) {
  try {
    const { patientType, patientId } = req.params;
    if (!isValidType(patientType)) {
      return res.status(400).json({
        message: `patientType must be one of: ${TYPE_VALUES.join(", ")}`,
      });
    }
    const invoices = await prisma.invoice.findMany({
      where: { patientType, patientId },
      // Ordered by the date the bill is dated FOR, falling back to insert
      // time, so a back-dated invoice sorts where the user expects it.
      orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
    });
    res.json(invoices);
  } catch (err) {
    console.error("listPatientInvoices error:", err);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
}

// GET /api/invoices/type/:patientType?search=&page=&limit=&payStatus= -> every
// invoice of one type (e.g. all "PHARMACY" invoices), newest first. Used by
// the Pharmacy Billing list page — unlike listPatientInvoices above, this
// isn't scoped to a single patient. `search` (optional) matches
// invoiceNumber or patientName, case-insensitive. `payStatus` (optional) is
// one of PENDING / PARTLY_PAID / FULLY_PAID, which matters now that an
// invoice can sit part-paid for days.
export async function listInvoicesByType(req, res) {
  try {
    const { patientType } = req.params;
    const { search = "", page, limit, payStatus = "" } = req.query;
    if (!isValidType(patientType)) {
      return res.status(400).json({
        message: `patientType must be one of: ${TYPE_VALUES.join(", ")}`,
      });
    }

    const where = { patientType };
    if (search.trim()) {
      where.OR = [
        { invoiceNumber: { contains: search.trim(), mode: "insensitive" } },
        { patientName: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    // Anything still owed is "pending", whether or not part of it is paid.
    if (payStatus === "PENDING") {
      where.balance = { gt: 0 };
    } else if (payStatus === "PARTLY_PAID") {
      where.balance = { gt: 0 };
      where.paid = { gt: 0 };
    } else if (payStatus === "FULLY_PAID") {
      where.balance = { lte: 0 };
    }

    const orderBy = [{ invoiceDate: "desc" }, { createdAt: "desc" }];

    // Unpaginated by default so existing callers keep working unchanged.
    if (!page && !limit) {
      const invoices = await prisma.invoice.findMany({ where, orderBy });
      return res.json(invoices);
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json({
      invoices,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error("listInvoicesByType error:", err);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
}

// GET /api/invoices/:id -> single invoice (for reprinting)
export async function getInvoice(req, res) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
    });
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.json(invoice);
  } catch (err) {
    console.error("getInvoice error:", err);
    res.status(500).json({ message: "Failed to fetch invoice" });
  }
}

// POST /api/invoices -> create the patient's invoice.
//
// OPD and IPD patients get exactly one invoice. Asking for a second returns
// 409 along with the existing invoice, so the client can just open that one
// for editing instead of erroring out.
export async function createInvoice(req, res) {
  try {
    const {
      patientType,
      patientId,
      patientName,
      lineItems,
      paymentMethod,
      notes,
      invoiceDate,
      createdById,
      createdByName,
    } = req.body;

    // Prefer the authenticated session (if requireAuth ran on this route and
    // populated req.user) over whatever the client sent, so this can't be
    // spoofed. Falls back to the client-supplied values for setups where
    // this route isn't behind requireAuth yet.
    const resolvedCreatedById = req.user?.id || createdById || null;
    const resolvedCreatedByName = req.user?.fullName || createdByName || null;

    if (!isValidType(patientType)) {
      return res.status(400).json({
        message: `patientType must be one of: ${TYPE_VALUES.join(", ")}`,
      });
    }
    if (!patientId || !patientName) {
      return res
        .status(400)
        .json({ message: "patientId and patientName are required" });
    }
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return res
        .status(400)
        .json({ message: "lineItems must be a non-empty array" });
    }

    const existing = await findExistingInvoice(patientType, patientId);
    if (existing) {
      return res.status(409).json({
        message: `${patientName} already has an invoice (${existing.invoiceNumber}). Open that invoice to make changes — a patient can only have one.`,
        invoice: existing,
      });
    }

    const invoiceNumber = await generateInvoiceNumber(patientType);
    const normalizedItems = normalizeLineItems(lineItems);
    const resolvedInvoiceDate = normalizeInvoiceDate(invoiceDate, new Date());

    // Anything collected up front becomes the invoice's first payment entry,
    // so the payment history is complete from the moment it's created and
    // every later instalment just appends to it.
    let payments = Array.isArray(req.body.payments)
      ? req.body.payments.map(normalizePaymentEntry)
      : [];
    if (payments.length === 0 && round2(req.body.paid) > 0) {
      payments = [
        normalizePaymentEntry({
          amount: round2(req.body.paid),
          method: PAYMENT_METHOD_VALUES.includes(paymentMethod)
            ? paymentMethod
            : "Cash",
          paymentDate: resolvedInvoiceDate,
          notes: "Paid at the time of billing.",
          receivedById: resolvedCreatedById,
          receivedByName: resolvedCreatedByName,
        }),
      ];
    }

    const totals = normaliseTotals({ ...req.body, payments });

    const data = {
      invoiceNumber,
      patientType,
      patientId,
      patientName,
      lineItems: normalizedItems,
      // Dated list of what the patient handed over, so the bill can print
      // "Payments Received" by date with a total. Snapshotted here rather
      // than re-read from the patient, so a reprint of a finalized invoice
      // always matches the document that was issued.
      payments,
      ...totals,
      ...patientDetailFields(req.body),
      // The date the bill is dated FOR, which is not always when the row was
      // inserted — a bill written up after the fact needs to carry the real
      // date. createdAt still records when it was actually saved.
      invoiceDate: resolvedInvoiceDate,
      paymentMethod: paymentMethod || null,
      notes: notes || null,
      status: STATUS_DRAFT,
      createdById: resolvedCreatedById,
      createdByName: resolvedCreatedByName,
    };

    let invoice;
    if (patientType === "PHARMACY") {
      // Dispensing through Pharmacy Billing now actually deducts stock —
      // done inside the same transaction as the invoice write so a stock
      // failure (not enough left) never leaves a half-saved invoice behind.
      invoice = await prisma.$transaction(async (tx) => {
        await applyPharmacyInvoiceStockChanges(tx, {
          previousItems: [],
          newItems: normalizedItems,
          contextLabel: `${patientName} (Invoice ${invoiceNumber})`,
        });
        return tx.invoice.create({ data });
      });
    } else {
      invoice = await prisma.invoice.create({ data });
    }

    res.status(201).json(invoice);
  } catch (err) {
    if (err instanceof StockError || err instanceof ValidationError) {
      return res.status(400).json({ message: err.message });
    }
    // Unique-constraint trip on invoiceNumber (two saves at the same instant)
    if (err.code === "P2002") {
      return res.status(409).json({
        message: "That invoice number was just taken. Try saving again.",
      });
    }
    console.error("createInvoice error:", err);
    res.status(500).json({ message: "Failed to save invoice" });
  }
}

// PUT /api/invoices/:id -> update an existing invoice in place.
//
// invoiceNumber, patientType, patientId and createdBy* are immutable — only
// the billable content, payment and refund fields can change, and only while
// the invoice is still a DRAFT. A FINALIZED invoice is rejected with 409.
export async function updateInvoice(req, res) {
  try {
    const existing = await prisma.invoice.findUnique({
      where: { id: req.params.id },
    });
    if (!existing)
      return res.status(404).json({ message: "Invoice not found" });

    if (existing.status === STATUS_FINALIZED) {
      return res.status(409).json({
        message: `Invoice ${existing.invoiceNumber} was finalized on ${new Date(
          existing.finalizedAt,
        ).toLocaleDateString("en-IN")} and can no longer be edited.`,
        invoice: existing,
      });
    }

    const { lineItems, paymentMethod, notes, invoiceDate } = req.body;

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return res
        .status(400)
        .json({ message: "lineItems must be a non-empty array" });
    }

    const normalizedItems = normalizeLineItems(lineItems);

    // Payments already recorded against this invoice stay authoritative
    // unless the caller explicitly sends a replacement list. Without this,
    // editing a line item would wipe a part-payment history with whatever
    // the form happened to be holding.
    const payments = Array.isArray(req.body.payments)
      ? req.body.payments.map(normalizePaymentEntry)
      : readPayments(existing);

    const data = {
      lineItems: normalizedItems,
      payments,
      ...normaliseTotals({ ...req.body, payments }),
      // Only overwrites the details the caller actually sent, so a partial
      // update can't blank out a phone number or doctor it never mentioned.
      ...patientDetailFields(req.body, { partial: true }),
      invoiceDate: normalizeInvoiceDate(invoiceDate, existing.invoiceDate),
      paymentMethod: paymentMethod || null,
      notes: notes || null,
    };

    let updated;
    if (existing.patientType === "PHARMACY") {
      const previousItems = Array.isArray(existing.lineItems)
        ? existing.lineItems
        : [];
      updated = await prisma.$transaction(async (tx) => {
        await applyPharmacyInvoiceStockChanges(tx, {
          previousItems,
          newItems: normalizedItems,
          contextLabel: `${existing.patientName} (Invoice ${existing.invoiceNumber})`,
        });
        return tx.invoice.update({ where: { id: req.params.id }, data });
      });
    } else {
      updated = await prisma.invoice.update({
        where: { id: req.params.id },
        data,
      });
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof StockError || err instanceof ValidationError) {
      return res.status(400).json({ message: err.message });
    }
    console.error("updateInvoice error:", err);
    res.status(500).json({ message: "Failed to update invoice" });
  }
}

// GET /api/invoices/:id/payments -> the invoice's payment history + rollups
export async function listInvoicePayments(req, res) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
    });
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const payments = readPayments(invoice);
    res.json({
      invoice,
      payments,
      grandTotal: invoice.grandTotal,
      paid: invoice.paid,
      balance: invoice.balance,
    });
  } catch (err) {
    console.error("listInvoicePayments error:", err);
    res.status(500).json({ message: "Failed to fetch invoice payments" });
  }
}

// POST /api/invoices/:id/payments -> record one amount received
// Body: { amount, method?, paymentDate?, referenceNumber?, notes? }
//
// Deliberately allowed on a FINALIZED invoice: locking a bill stops its
// CONTENT changing, but a patient settling a pending balance days later is
// exactly the case part-payments exist for. Only paid/balance/payments move.
export async function addInvoicePayment(req, res) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
    });
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const entry = normalizePaymentEntry({
      ...req.body,
      receivedById: req.user?.id || req.body.receivedById || null,
      receivedByName: req.user?.fullName || req.body.receivedByName || null,
    });

    // Taking more than the outstanding balance is allowed rather than
    // rejected (reception may collect a round figure, or the bill may shrink
    // later). The excess simply sits as an overpayment, which is what the
    // refund rule in normaliseTotals then works from.
    const payments = [...withOpeningPayment(invoice), entry].sort(
      (a, b) => new Date(a.paymentDate) - new Date(b.paymentDate),
    );

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { payments, ...totalsFromPayments(invoice, payments) },
    });

    res.status(201).json(updated);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ message: err.message });
    }
    console.error("addInvoicePayment error:", err);
    res.status(500).json({ message: "Failed to record payment" });
  }
}

// DELETE /api/invoices/:id/payments/:paymentId -> remove a mis-keyed entry.
// The remaining entries are re-totalled, so paid/balance stay in step.
export async function deleteInvoicePayment(req, res) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
    });
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const current = withOpeningPayment(invoice);
    const payments = current.filter((p) => p.id !== req.params.paymentId);
    if (payments.length === current.length) {
      return res.status(404).json({ message: "Payment entry not found" });
    }

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { payments, ...totalsFromPayments(invoice, payments) },
    });

    res.json(updated);
  } catch (err) {
    console.error("deleteInvoicePayment error:", err);
    res.status(500).json({ message: "Failed to delete payment" });
  }
}

// PATCH /api/invoices/:id/finalize -> lock the invoice.
//
// After this the invoice is read-only: updateInvoice rejects it, and for IPD
// it's the gate that lets the patient be discharged. There is no un-finalize
// endpoint on purpose — a finalized bill is the clinic's issued document.
export async function finalizeInvoice(req, res) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
    });
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (invoice.status === STATUS_FINALIZED) {
      return res.status(409).json({
        message: `Invoice ${invoice.invoiceNumber} is already finalized.`,
        invoice,
      });
    }

    const items = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
    if (items.length === 0) {
      return res.status(400).json({
        message: "Add at least one line item before finalizing this invoice.",
      });
    }

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: STATUS_FINALIZED,
        finalizedAt: new Date(),
        finalizedById: req.user?.id || req.body.finalizedById || null,
        finalizedByName: req.user?.fullName || req.body.finalizedByName || null,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error("finalizeInvoice error:", err);
    res.status(500).json({ message: "Failed to finalize invoice" });
  }
}

// Used by ipd.controller.dischargePatient — kept here so the "is this
// patient billed and locked?" rule lives in one place.
export async function getFinalizedInvoiceFor(patientType, patientId) {
  const invoice = await findExistingInvoice(patientType, patientId);
  if (!invoice) return { invoice: null, finalized: false };
  return { invoice, finalized: invoice.status === STATUS_FINALIZED };
}

// Mirrors an IPD patient's refund figures onto their DRAFT invoice so the
// bill prints the refund without anyone having to re-open the invoice
// editor. Silently does nothing when there's no invoice yet, or when the
// invoice is already finalized (a locked bill keeps its printed numbers).
export async function syncRefundToInvoice(
  patientId,
  { refundAmount, refundReason, refundDate, refundMethod },
) {
  const invoice = await findExistingInvoice("IPD", patientId);
  if (!invoice || invoice.status === STATUS_FINALIZED) return invoice;

  // Same cap as normaliseTotals — only an overpayment can be refunded.
  const refundable = round2(Math.max(0, invoice.paid - invoice.grandTotal));
  const amount = Math.min(refundable, Math.max(0, round2(refundAmount)));
  const balance = round2(invoice.grandTotal - (invoice.paid - amount));

  return prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      refundAmount: amount,
      refundReason: refundReason || null,
      refundDate: parseOptionalDate(refundDate),
      refundMethod: refundMethod || null,
      balance,
    },
  });
}

// PATCH /api/invoices/:id/return -> mark some/all quantities on a PHARMACY
// invoice as returned by the patient, and add exactly those tablets back to
// stock. Can be called more than once on the same invoice (partial returns
// over time) — each call only adds the newly-returned amount, verified
// against what's still returnable (sold − already returned) at the time of
// the call, so the same tablets can never be re-added to stock twice.
//
// Body: { items: [{ index, returnQty }], notes? }
//   `index` is the position of the line item in the invoice's lineItems
//   array (as returned by GET /api/invoices/:id).
export async function markInvoiceReturn(req, res) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
    });
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    if (invoice.patientType !== "PHARMACY") {
      return res
        .status(400)
        .json({ message: "Only pharmacy invoices can be marked as returned." });
    }

    const { items, notes } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ message: "Select at least one item and quantity to return." });
    }

    const lineItems = (
      Array.isArray(invoice.lineItems) ? invoice.lineItems : []
    ).map((it) => ({ ...it }));

    const stockUpdates = []; // { medicineId, qty, description }
    let anyValidReturn = false;

    for (const reqItem of items) {
      const idx = Number(reqItem.index);
      const returnQty = toNum(reqItem.returnQty);
      if (!Number.isInteger(idx) || idx < 0 || idx >= lineItems.length) {
        return res
          .status(400)
          .json({ message: "Invalid line item reference." });
      }
      if (returnQty <= 0) continue;

      const line = lineItems[idx];
      const soldQty = toNum(line.qty);
      const alreadyReturned = toNum(line.returnedQty);
      // Re-verify the count against what's actually still returnable RIGHT
      // NOW (not just what the client thinks it is) — this is the "verify
      // tablet counts one more time" check before anything touches stock.
      const maxReturnable = Math.max(0, soldQty - alreadyReturned);

      if (returnQty > maxReturnable) {
        return res.status(400).json({
          message: `Cannot return ${returnQty} of "${line.description}" — only ${maxReturnable} left to return (sold ${soldQty}, already returned ${alreadyReturned}).`,
        });
      }

      line.returnedQty = alreadyReturned + returnQty;
      anyValidReturn = true;

      if (line.medicineId) {
        stockUpdates.push({
          medicineId: line.medicineId,
          qty: returnQty,
          description: line.description,
        });
      }
    }

    if (!anyValidReturn) {
      return res
        .status(400)
        .json({
          message: "Enter a valid return quantity for at least one item.",
        });
    }

    const allFullyReturned = lineItems.every(
      (it) => toNum(it.returnedQty) >= toNum(it.qty),
    );
    const anyReturned = lineItems.some((it) => toNum(it.returnedQty) > 0);
    const returnStatus = allFullyReturned
      ? "FULL"
      : anyReturned
        ? "PARTIAL"
        : "NONE";

    const resolvedById = req.user?.id || req.body.returnedById || null;
    const resolvedByName =
      req.user?.fullName || req.body.returnedByName || null;

    const updated = await prisma.$transaction(async (tx) => {
      for (const u of stockUpdates) {
        const med = await tx.medicine.findUnique({
          where: { id: u.medicineId },
        });
        // If the medicine record was deleted since the sale, the return is
        // still recorded on the invoice — it just can't be added back to a
        // stock row that no longer exists.
        if (!med) continue;

        await tx.medicine.update({
          where: { id: u.medicineId },
          data: { quantity: med.quantity + u.qty },
        });
        await tx.stockHistory.create({
          data: {
            medicineId: u.medicineId,
            date: new Date(),
            action: "ADD",
            quantity: u.qty,
            reason: `Returned by patient — Invoice ${invoice.invoiceNumber}${
              u.description ? ` (${u.description})` : ""
            }`,
          },
        });
      }

      return tx.invoice.update({
        where: { id: invoice.id },
        data: {
          lineItems,
          returnStatus,
          returnedAt: new Date(),
          returnNotes: notes?.trim() ? notes.trim() : invoice.returnNotes,
          returnedById: resolvedById,
          returnedByName: resolvedByName,
        },
      });
    });

    res.json(updated);
  } catch (err) {
    console.error("markInvoiceReturn error:", err);
    res.status(500).json({ message: "Failed to process the return." });
  }
}
