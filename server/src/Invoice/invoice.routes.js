// server/src/Invoice/invoice.routes.js
import { Router } from "express";
import {
  previewNextInvoiceNumber,
  getPatientInvoice,
  listPatientInvoices,
  listInvoicesByType,
  getInvoice,
  createInvoice,
  updateInvoice,
  finalizeInvoice,
  markInvoiceReturn,
  listInvoicePayments,
  addInvoicePayment,
  deleteInvoicePayment,
} from "./invoice.controller.js";

const router = Router();

// Registered before "/:id" so "next"/"single"/"patient"/"type" aren't
// swallowed as an :id value
router.get("/next/:patientType", previewNextInvoiceNumber);

// The ONE invoice belonging to an OPD/IPD patient -> { invoice } | { invoice: null }
router.get("/single/:patientType/:patientId", getPatientInvoice);

router.get("/patient/:patientType/:patientId", listPatientInvoices);
router.get("/type/:patientType", listInvoicesByType);

router.get("/:id", getInvoice);
router.post("/", createInvoice);
router.put("/:id", updateInvoice);

// Locks the invoice. After this it can't be edited, and for IPD it's what
// unlocks discharge. Deliberately has no matching "un-finalize" route.
router.patch("/:id/finalize", finalizeInvoice);

router.patch("/:id/return", markInvoiceReturn);

// Part-payments — a patient can settle a bill in instalments, so each amount
// received is recorded separately and paid/balance are recomputed from the
// full history. Allowed on a finalized invoice too: locking stops the bill's
// CONTENT changing, not a pending balance being cleared later.
router.get("/:id/payments", listInvoicePayments);
router.post("/:id/payments", addInvoicePayment);
router.delete("/:id/payments/:paymentId", deleteInvoicePayment);

export default router;

// --- Mounting (add this to your server entry file, e.g. server/src/index.js) ---
// import invoiceRoutes from "./Invoice/invoice.routes.js";
// app.use("/api/invoices", invoiceRoutes);
