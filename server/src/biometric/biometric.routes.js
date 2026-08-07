// server/src/biometric/biometric.routes.js
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import * as biometric from "./biometric.controller.js";
import * as shift from "./shift.controller.js";

const router = Router();

// ── Device punch — device-facing, NOT behind admin JWT auth. The device
// authenticates itself by sending its own registered, active serialNumber;
// biometricService.processPunch() rejects anything else. Registered here
// BEFORE the router.use(requireAuth, ...) below so it's exempt from it. ──
router.post("/punch", biometric.punch);

// Everything below at minimum requires an authenticated user.
router.use(requireAuth);

// Working Timings & Shift Management — full access (read + create/edit/
// toggle/delete) is now open to MANAGER as well as ADMIN. Managers own
// Shift Assignment day-to-day, so they need to be able to manage the
// underlying Shifts themselves, not just read them.
router.get("/shifts", requireRole("ADMIN", "MANAGER"), shift.listShifts);
router.get("/shifts/:id", requireRole("ADMIN", "MANAGER"), shift.getShift);
router.post("/shifts", requireRole("ADMIN", "MANAGER"), shift.createShift);
router.put("/shifts/:id", requireRole("ADMIN", "MANAGER"), shift.updateShift);
router.patch(
  "/shifts/:id/toggle",
  requireRole("ADMIN", "MANAGER"),
  shift.toggleShift,
);
router.delete(
  "/shifts/:id",
  requireRole("ADMIN", "MANAGER"),
  shift.deleteShift,
);

// Everything else below (Dashboard, Devices, Mappings, Search, Logs,
// Attendance) is now open to MANAGER too, giving Manager full access to
// the Biometric Management module, same as Admin.
router.use(requireRole("ADMIN", "MANAGER"));

// Dashboard
router.get("/dashboard", biometric.getDashboard);

// Devices
router.get("/devices", biometric.listDevices);
router.post("/devices", biometric.createDevice);
router.put("/devices/:id", biometric.updateDevice);
router.patch("/devices/:id/toggle", biometric.toggleDevice);

// Mappings
router.get("/mappings", biometric.listMappings);
router.post("/mappings", biometric.createMapping);
router.patch("/mappings/:id/deactivate", biometric.deactivateMapping);
router.patch("/mappings/:id/shift", shift.assignMappingShift);

// Search
router.get("/users", biometric.searchUsers);
router.get("/employees", biometric.searchEmployees);

// Logs
router.get("/logs", biometric.listLogs);

// Attendance
router.get("/attendance", biometric.listAttendance);
router.get("/attendance/report", biometric.attendanceReport);

export default router;
