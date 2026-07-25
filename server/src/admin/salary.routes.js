// server/src/admin/salary.routes.js
// Mounted at /api/admin/salaries by admin.routes.js, which already applies
// requireAuth + requireRole("ADMIN") to everything under it — nothing extra
// needed here.
import { Router } from "express";
import {
  listSalaries,
  getEmployeeHistory,
  generateForMonth,
  recalculate,
  updateSalary,
  markPaid,
  reopenSalary,
  deleteSalary,
} from "./salary.controller.js";

const router = Router();

router.get("/", listSalaries);
router.get("/employee/:employeeId", getEmployeeHistory);
router.post("/generate", generateForMonth);
router.put("/:id/recalculate", recalculate);
router.put("/:id/mark-paid", markPaid);
router.put("/:id/reopen", reopenSalary);
router.put("/:id", updateSalary);
router.delete("/:id", deleteSalary);

export default router;