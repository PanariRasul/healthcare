// server/src/admin/employee-shift.routes.js
// Mounted at /api/admin/employee-shifts by admin.routes.js, which already
// applies requireAuth + requireRole("ADMIN") to everything under it —
// nothing extra needed here.
import { Router } from "express";
import { listEmployeeShifts, getShiftHistory, assignShift, bulkAssignShift } from "./employee-shift.controller.js";

const router = Router();

router.get("/", listEmployeeShifts);
router.get("/:id/history", getShiftHistory);
router.put("/:id", assignShift);
router.post("/bulk-assign", bulkAssignShift);

export default router;