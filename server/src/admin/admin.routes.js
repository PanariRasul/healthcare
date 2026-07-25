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
import employeeShiftRoutes from "./employee-shift.routes.js";

const router = Router();

// Every route here requires an authenticated user at minimum. Role is now
// checked per-route below (rather than one blanket ADMIN-only gate) so
// Manager can reach Employee Directory + Shift Assignment while everything
// else in this file — staff accounts, salaries, holidays — stays Admin-only.
router.use(requireAuth);

// ── Staff accounts (Doctor/Receptionist/Pharmacy/Admin — these log in) ──
// ADMIN only. Creation reuses the same `register` controller auth.routes.js
// used to expose publicly — same logic, now admin-gated instead of public.
router.post("/users", requireRole("ADMIN"), register);
router.get("/users", requireRole("ADMIN"), listUsers);
router.get("/users/:id", requireRole("ADMIN"), getUser);
router.put("/users/:id", requireRole("ADMIN"), updateUser);
router.put("/users/:id/reset-password", requireRole("ADMIN"), adminResetPassword);

// ── Employee directory (nurses/ward staff/etc — NOT login accounts) ──
// ADMIN + MANAGER.
router.get("/employees", requireRole("ADMIN", "MANAGER"), listEmployees);
router.post("/employees", requireRole("ADMIN", "MANAGER"), createEmployee);
router.put("/employees/:id", requireRole("ADMIN", "MANAGER"), updateEmployee);
router.delete("/employees/:id", requireRole("ADMIN", "MANAGER"), deleteEmployee);

// ── Salary management (monthly generation, editing, payment history) ──
// ADMIN only.
router.use("/salaries", requireRole("ADMIN"), salaryRoutes);

// ── Working Days calendar (public/company holidays feeding salary calc) ──
// ADMIN only.
router.use("/holidays", requireRole("ADMIN"), holidayRoutes);

// ── Employee Shift Assignment (bulk/single shift changes + audit trail) ──
// ADMIN + MANAGER.
router.use("/employee-shifts", requireRole("ADMIN", "MANAGER"), employeeShiftRoutes);

export default router;