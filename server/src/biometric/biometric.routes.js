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

// Working Timings & Shift Management — READ access only is opened up to
// MANAGER too, since the Shift Assignment page (used by managers) needs to
// populate its "assign to shift" dropdown. Mutating the shifts themselves
// (create/edit/toggle/delete) stays ADMIN-only.
router.get("/shifts", requireRole("ADMIN", "MANAGER"), shift.listShifts);
router.get("/shifts/:id", requireRole("ADMIN", "MANAGER"), shift.getShift);
router.post("/shifts", requireRole("ADMIN"), shift.createShift);
router.put("/shifts/:id", requireRole("ADMIN"), shift.updateShift);
router.patch("/shifts/:id/toggle", requireRole("ADMIN"), shift.toggleShift);
router.delete("/shifts/:id", requireRole("ADMIN"), shift.deleteShift);

// Everything else below stays ADMIN-only — same as before.
router.use(requireRole("ADMIN"));

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