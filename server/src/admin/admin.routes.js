// server/src/admin/admin.routes.js
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { register } from "../auth/auth.controller.js";
import {
  listUsers,
  getUser,
  updateUser,
  adminResetPassword,
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "./admin.controller.js";
import salaryRoutes from "./salary.routes.js";
import holidayRoutes from "./holiday.routes.js";

const router = Router();

// Every route here requires an authenticated ADMIN. Nothing in this file is
// reachable by Doctor/Receptionist/Pharmacy accounts.
router.use(requireAuth, requireRole("ADMIN"));

// ── Staff accounts (Doctor/Receptionist/Pharmacy/Admin — these log in) ──
// Creation reuses the same `register` controller auth.routes.js used to
// expose publicly — same logic, now admin-gated instead of public.
router.post("/users", register);
router.get("/users", listUsers);
router.get("/users/:id", getUser);
router.put("/users/:id", updateUser);
router.put("/users/:id/reset-password", adminResetPassword);

// ── Employee directory (nurses/ward staff/etc — NOT login accounts) ──
router.get("/employees", listEmployees);
router.post("/employees", createEmployee);
router.put("/employees/:id", updateEmployee);
router.delete("/employees/:id", deleteEmployee);

// ── Salary management (monthly generation, editing, payment history) ──
router.use("/salaries", salaryRoutes);

// ── Working Days calendar (public/company holidays feeding salary calc) ──
router.use("/holidays", holidayRoutes);

export default router;