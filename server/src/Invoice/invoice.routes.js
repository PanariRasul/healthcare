// server/src/Invoice/invoice.routes.js
import { Router } from "express";
import {
  previewNextInvoiceNumber,
  listPatientInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
} from "./invoice.controller.js";

const router = Router();

// Registered before "/:id" so "next"/"patient" aren't swallowed as an :id value
router.get("/next/:patientType", previewNextInvoiceNumber);
router.get("/patient/:patientType/:patientId", listPatientInvoices);

router.get("/:id", getInvoice);
router.post("/", createInvoice);
router.put("/:id", updateInvoice);

export default router;

// --- Mounting (add this to your server entry file, e.g. server/src/index.js) ---
// import invoiceRoutes from "./Invoice/invoice.routes.js";
// app.use("/api/invoices", invoiceRoutes);
