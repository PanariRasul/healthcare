// server/src/Invoice/invoice.controller.js
import prisma from "../lib/prisma.js";

const TYPE_VALUES = ["OPD", "IPD", "PHARMACY"];
const PREFIX = "VPC"; // clinic prefix — change here if the clinic name changes

function isValidType(t) {
  return TYPE_VALUES.includes(t);
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

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
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
      },
    });

    res.json(updated);
  } catch (err) {
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

    const invoice = await prisma.invoice.create({
      data: {
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
      },
    });

    res.status(201).json(invoice);
  } catch (err) {
    console.error("createInvoice error:", err);
    res.status(500).json({ message: "Failed to save invoice" });
  }
}
