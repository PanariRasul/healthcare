// server/src/admin/holiday.controller.js
//
// Backs the Working Days calendar used for salary calculations. A "holiday"
// here is any date the office is closed beyond the weekly Sunday off —
// national/public holidays or company-declared ones. Sundays are never
// stored; they're derived from the date itself wherever counts are needed,
// so the weekly off pattern can't drift out of sync with a stored record.
import prisma from "../lib/prisma.js";
import { monthRange, getWorkingDaysSummary } from "../lib/workingDays.js";

const VALID_TYPES = ["PUBLIC", "COMPANY"];

// GET /api/admin/holidays?year=&month=
// Returns every holiday in the month plus the derived totals the calendar
// header shows (total days, Sundays, holidays, working days).
export async function listHolidays(req, res) {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ message: "year and month are required." });
    }
    const y = Number(year);
    const m = Number(month);
    if (m < 1 || m > 12) return res.status(400).json({ message: "month must be between 1 and 12." });

    const { start, end } = monthRange(y, m);
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
    });

    const summary = await getWorkingDaysSummary(y, m);

    return res.status(200).json({ holidays, summary });
  } catch (err) {
    console.error("List holidays error:", err);
    return res.status(500).json({ message: "Could not fetch holidays." });
  }
}

// POST /api/admin/holidays  { date, name, type }
// Upserts by date. Clicking an already-marked date again and saving a new
// name/type edits that holiday in place rather than hitting the unique
// constraint on `date`.
export async function upsertHoliday(req, res) {
  try {
    const { date, name, type = "COMPANY" } = req.body;
    if (!date || !name) {
      return res.status(400).json({ message: "date and name are required." });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: `type must be one of ${VALID_TYPES.join(", ")}` });
    }

    const day = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(day.getTime())) {
      return res.status(400).json({ message: "date must be a valid date (YYYY-MM-DD)." });
    }

    const holiday = await prisma.holiday.upsert({
      where: { date: day },
      update: { name, type },
      create: { date: day, name, type },
    });

    return res.status(200).json({ holiday });
  } catch (err) {
    console.error("Upsert holiday error:", err);
    return res.status(500).json({ message: "Could not save holiday." });
  }
}

// DELETE /api/admin/holidays/:id
export async function deleteHoliday(req, res) {
  try {
    const existing = await prisma.holiday.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Holiday not found." });

    await prisma.holiday.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: "Holiday removed." });
  } catch (err) {
    console.error("Delete holiday error:", err);
    return res.status(500).json({ message: "Could not remove holiday." });
  }
}