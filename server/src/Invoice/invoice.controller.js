// server/src/Invoice/invoice.controller.js
import prisma from "../lib/prisma.js";

const TYPE_VALUES = ["OPD", "IPD", "PHARMACY"];
const PREFIX = "VPC"; // clinic prefix — change here if the clinic name changes

function isValidType(t) {
  return TYPE_VALUES.includes(t);
}

// Thrown for pharmacy-stock problems hit while saving a PHARMACY invoice
// (missing medicine, not enough stock left). Caught separately so the route
// can answer 400 instead of a generic 500.
class StockError extends Error {}

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
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
// VPC-INV-OPD-000001, VPC-INV-IPD-000042. Numbering is per-type and based on
// the highest existing number for that type (same pattern used for
// OPD token numbers / IPD serial numbers elsewhere in this codebase).
async function generateInvoiceNumber(patientType) {
  const last = await prisma.invoice.findFirst({
    where: { patientType },
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true },
  });
  const lastNum = last?.invoiceNumber
    ? parseInt(last.invoiceNumber.split("-").pop(), 10) || 0
    : 0;
  const next = lastNum + 1;
  return `${PREFIX}-INV-${patientType}-${String(next).padStart(6, "0")}`;
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
      orderBy: { createdAt: "desc" },
    });
    res.json(invoices);
  } catch (err) {
    console.error("listPatientInvoices error:", err);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
}

// GET /api/invoices/type/:patientType?search= -> every invoice of one type
// (e.g. all "PHARMACY" invoices), newest first. Used by the Pharmacy
// Billing list page — unlike listPatientInvoices above, this isn't scoped
// to a single patient. `search` (optional) matches invoiceNumber or
// patientName, case-insensitive.
export async function listInvoicesByType(req, res) {
  try {
    const { patientType } = req.params;
    const { search = "" } = req.query;
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

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json(invoices);
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

// PUT /api/invoices/:id -> update an existing invoice in place (edit/correct it).
// invoiceNumber, patientType, patientId, createdBy* are immutable — only the
// billable content and payment fields can change.
export async function updateInvoice(req, res) {
  try {
    const existing = await prisma.invoice.findUnique({
      where: { id: req.params.id },
    });
    if (!existing)
      return res.status(404).json({ message: "Invoice not found" });

    const {
      lineItems,
      subtotal,
      discount,
      gstPercent,
      gstAmount,
      grandTotal,
      paid,
      balance,
      paymentMethod,
      notes,
    } = req.body;

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return res
        .status(400)
        .json({ message: "lineItems must be a non-empty array" });
    }

    const data = {
      lineItems,
      subtotal: Number(subtotal) || 0,
      discount: Number(discount) || 0,
      gstPercent: Number(gstPercent) || 0,
      gstAmount: Number(gstAmount) || 0,
      grandTotal: Number(grandTotal) || 0,
      paid: Number(paid) || 0,
      balance: Number(balance) || 0,
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
          newItems: lineItems,
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
    if (err instanceof StockError) {
      return res.status(400).json({ message: err.message });
    }
    console.error("updateInvoice error:", err);
    res.status(500).json({ message: "Failed to update invoice" });
  }
}

// POST /api/invoices -> create + persist a new invoice
export async function createInvoice(req, res) {
  try {
    const {
      patientType,
      patientId,
      patientName,
      lineItems,
      subtotal,
      discount,
      gstPercent,
      gstAmount,
      grandTotal,
      paid,
      balance,
      paymentMethod,
      notes,
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

    const invoiceNumber = await generateInvoiceNumber(patientType);

    const data = {
      invoiceNumber,
      patientType,
      patientId,
      patientName,
      lineItems,
      subtotal: Number(subtotal) || 0,
      discount: Number(discount) || 0,
      gstPercent: Number(gstPercent) || 0,
      gstAmount: Number(gstAmount) || 0,
      grandTotal: Number(grandTotal) || 0,
      paid: Number(paid) || 0,
      balance: Number(balance) || 0,
      paymentMethod: paymentMethod || null,
      notes: notes || null,
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
          newItems: lineItems,
          contextLabel: `${patientName} (Invoice ${invoiceNumber})`,
        });
        return tx.invoice.create({ data });
      });
    } else {
      invoice = await prisma.invoice.create({ data });
    }

    res.status(201).json(invoice);
  } catch (err) {
    if (err instanceof StockError) {
      return res.status(400).json({ message: err.message });
    }
    console.error("createInvoice error:", err);
    res.status(500).json({ message: "Failed to save invoice" });
  }
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
        return res.status(400).json({ message: "Invalid line item reference." });
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
        .json({ message: "Enter a valid return quantity for at least one item." });
    }

    const allFullyReturned = lineItems.every(
      (it) => toNum(it.returnedQty) >= toNum(it.qty),
    );
    const anyReturned = lineItems.some((it) => toNum(it.returnedQty) > 0);
    const returnStatus = allFullyReturned ? "FULL" : anyReturned ? "PARTIAL" : "NONE";

    const resolvedById = req.user?.id || req.body.returnedById || null;
    const resolvedByName = req.user?.fullName || req.body.returnedByName || null;

    const updated = await prisma.$transaction(async (tx) => {
      for (const u of stockUpdates) {
        const med = await tx.medicine.findUnique({ where: { id: u.medicineId } });
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