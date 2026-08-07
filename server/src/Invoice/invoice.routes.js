// server/src/Invoice/invoice.routes.js
import { Router } from "express";
import {
  previewNextInvoiceNumber,
  listPatientInvoices,
  listInvoicesByType,
  getInvoice,
  createInvoice,
  updateInvoice,
} from "./invoice.controller.js";

const router = Router();

// Registered before "/:id" so "next"/"patient"/"type" aren't swallowed as an :id value
router.get("/next/:patientType", previewNextInvoiceNumber);
router.get("/patient/:patientType/:patientId", listPatientInvoices);
router.get("/type/:patientType", listInvoicesByType);

router.get("/:id", getInvoice);
router.post("/", createInvoice);
router.put("/:id", updateInvoice);

export default router;

// --- Mounting (add this to your server entry file, e.g. server/src/index.js) ---
// import invoiceRoutes from "./Invoice/invoice.routes.js";
// app.use("/api/invoices", invoiceRoutes);
