// server/src/admin/holiday.routes.js
// Mounted at /api/admin/holidays by admin.routes.js, which already applies
// requireAuth + requireRole("ADMIN") to everything under it — nothing extra
// needed here.
import { Router } from "express";
import { listHolidays, upsertHoliday, deleteHoliday } from "./holiday.controller.js";

const router = Router();

router.get("/", listHolidays);
router.post("/", upsertHoliday);
router.delete("/:id", deleteHoliday);

export default router;