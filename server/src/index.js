import express from "express";
import cors from "cors";
import authRoutes from "./auth/auth.routes.js";
import opdRoutes from "./opd/opd.routes.js";
import categoryRoutes from "./pharmacy/category.routes.js";
import medicineRoutes from "./pharmacy/medicine.routes.js";
import notificationsRoutes from "./notifications/notifications.routes.js";
import ipdRoutes from "./IPD/ipd.routes.js";
import ipdPaymentRoutes from "./IPD/ipdPayment.routes.js";
import adminRoutes from "./admin/admin.routes.js";
import biometricRoutes from "./biometric/biometric.routes.js"; // NEW
import invoiceRoutes from "./Invoice/invoice.routes.js";

const app = express();

// Middleware
app.use(cors({ origin: process.env.CLIENT_ORIGIN }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Route
app.get("/", (req, res) => {
  res.json({
    message: "Server is Live",
  });
});

// Auth routes
app.use("/api/auth", authRoutes);

// OPD routes
app.use("/api/opd/patients", opdRoutes);
// IPD routes
app.use("/api/ipd/patients", ipdRoutes);
app.use("/api/ipd", ipdRoutes);
app.use("/api/ipd-payments", ipdPaymentRoutes);

// Pharmacy routes
app.use("/api/pharmacy/categories", categoryRoutes);
app.use("/api/pharmacy/medicines", medicineRoutes);

// Notifications (read/dismiss tracking, per-user)
app.use("/api/notifications", notificationsRoutes);

// Admin routes (staff account management + employee directory).
// No requireAuth/requireRole needed here at the mount point — admin.routes.js
// already applies `router.use(requireAuth, requireRole("ADMIN"))` internally,
// same pattern opd.routes.js uses for requireModule("OPD").
app.use("/api/admin", adminRoutes);

// Biometric attendance module (devices, mappings, punch ingestion,
app.use("/api/biometric", biometricRoutes);

//Invoice routes

app.use("/api/invoices", invoiceRoutes);

export default app;
