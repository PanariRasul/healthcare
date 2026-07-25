// server/src/admin/salary.controller.js
//
// Employee monthly salary management. One EmployeeSalary row per
// employee/month. Rows are usually created in bulk with `generateForMonth`,
// which snapshots the employee's current base salary and pulls that month's
// Attendance records to auto-fill present/leave/absent days and suggest a
// loss-of-pay (LOP) deduction. Everything it computes is still editable
// afterwards via `updateSalary` — bonuses, extra paid leaves, one-off
// adjustments for next month, etc. Past months are never rewritten by
// editing the Employee record itself, only by editing that month's row.
//
// The core math (see suggestLop/deriveTotals below): Net Salary is always
// derived from Present Days worked. Every day that's ON_LEAVE or ABSENT is
// automatically treated as Loss of Pay (LOP) UNLESS it's covered by the
// Paid Leaves quota — so absences reduce pay automatically, while still
// leaving both Paid Leaves and LOP Days open for the admin to override by
// hand (e.g. an unpaid absence the admin wants to excuse anyway).
import prisma from "../lib/prisma.js";
import { monthRange, getWorkingDaysSummary } from "../lib/workingDays.js";

const EDITABLE_STATUSES = ["DRAFT", "FINALIZED"];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Pulls Attendance rows for one employee/month and reduces them to
// present/leave/absent day counts. HALF_DAY counts as 0.5 present day.
async function computeAttendance(employeeId, year, month) {
  const { start, end } = monthRange(year, month);
  const records = await prisma.attendance.findMany({
    where: { employeeId, date: { gte: start, lte: end } },
    select: { status: true },
  });

  let presentDays = 0;
  let leaveDays = 0;
  let absentDays = 0;
  for (const r of records) {
    if (r.status === "PRESENT") presentDays += 1;
    else if (r.status === "HALF_DAY") presentDays += 0.5;
    else if (r.status === "ON_LEAVE") leaveDays += 1;
    else if (r.status === "ABSENT") absentDays += 1;
  }
  return { presentDays, leaveDays, absentDays };
}

// Recomputes the derived money fields (perDaySalary, leaveDeduction,
// netSalary) from whatever base/attendance/adjustment fields are currently
// on the record. Called after every create/edit so netSalary never drifts
// out of sync with its inputs. Algebraically this always nets out to:
//   netSalary = perDaySalary * (presentDays + paidLeaves) + bonus + otherAdjustment
// i.e. pay for the days actually worked (plus any excused paid leave),
// which is exactly "prorate salary by Present Days."
function deriveTotals({ baseSalary, totalDays, lopDays, bonus, otherAdjustment }) {
  const perDaySalary = totalDays > 0 ? baseSalary / totalDays : 0;
  const leaveDeduction = perDaySalary * lopDays;
  const netSalary = baseSalary - leaveDeduction + bonus + otherAdjustment;
  return {
    perDaySalary: round2(perDaySalary),
    leaveDeduction: round2(leaveDeduction),
    netSalary: round2(netSalary),
  };
}

// Absent days (and unpaid ON_LEAVE days) automatically become LOP, minus
// whatever the admin has granted as Paid Leaves for the month. Clamped at 0
// so granting more paid leaves than were actually taken never creates a
// negative LOP (which would otherwise look like a bonus).
function suggestLop({ leaveDays, absentDays, paidLeaves }) {
  return Math.max(0, leaveDays + absentDays - paidLeaves);
}

// GET /api/admin/salaries?year=&month=&employeeId=&status=
export async function listSalaries(req, res) {
  try {
    const { year, month, employeeId, status } = req.query;
    const where = {};
    if (year) where.year = Number(year);
    if (month) where.month = Number(month);
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    const salaries = await prisma.employeeSalary.findMany({
      where,
      include: { employee: { select: { id: true, fullName: true, designation: true, isActive: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }, { employee: { fullName: "asc" } }],
    });

    const summary = salaries.reduce(
      (acc, s) => {
        acc.totalNet += s.netSalary;
        acc.totalBonus += s.bonus;
        acc.totalDeduction += s.leaveDeduction;
        acc.paidCount += s.status === "PAID" ? 1 : 0;
        acc.pendingCount += s.status !== "PAID" ? 1 : 0;
        return acc;
      },
      { totalNet: 0, totalBonus: 0, totalDeduction: 0, paidCount: 0, pendingCount: 0 }
    );

    return res.status(200).json({ salaries, summary });
  } catch (err) {
    console.error("List salaries error:", err);
    return res.status(500).json({ message: "Could not fetch salary records." });
  }
}

// GET /api/admin/salaries/employee/:employeeId
export async function getEmployeeHistory(req, res) {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.employeeId } });
    if (!employee) return res.status(404).json({ message: "Employee not found." });

    const salaries = await prisma.employeeSalary.findMany({
      where: { employeeId: req.params.employeeId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    return res.status(200).json({ employee, salaries });
  } catch (err) {
    console.error("Employee salary history error:", err);
    return res.status(500).json({ message: "Could not fetch salary history." });
  }
}

// POST /api/admin/salaries/generate  { year, month, paidLeaves? }
// Creates a DRAFT row for every active employee that doesn't already have
// one for this year/month. Skips employees who already have a row (so it's
// safe to click again after adding a new employee mid-month) and skips
// employees with no salary set on their directory record.
export async function generateForMonth(req, res) {
  try {
    const { year, month, paidLeaves = 0 } = req.body;
    if (!year || !month) {
      return res.status(400).json({ message: "year and month are required." });
    }
    const y = Number(year);
    const m = Number(month);
    if (m < 1 || m > 12) return res.status(400).json({ message: "month must be between 1 and 12." });

    const employees = await prisma.employee.findMany({ where: { isActive: true } });
    const existing = await prisma.employeeSalary.findMany({
      where: { year: y, month: m, employeeId: { in: employees.map((e) => e.id) } },
      select: { employeeId: true },
    });
    const existingIds = new Set(existing.map((e) => e.employeeId));

    // totalDays = working days for the month (calendar days minus Sundays
    // minus configured Holidays), per the Working Days calendar — not the
    // raw number of days on the calendar.
    const { workingDays: total } = await getWorkingDaysSummary(y, m);
    const created = [];
    const skippedNoSalary = [];

    for (const emp of employees) {
      if (existingIds.has(emp.id)) continue;
      if (emp.salary === null || emp.salary === undefined) {
        skippedNoSalary.push(emp.fullName);
        continue;
      }

      const { presentDays, leaveDays, absentDays } = await computeAttendance(emp.id, y, m);
      const lopDays = suggestLop({ leaveDays, absentDays, paidLeaves: Number(paidLeaves) });
      const totals = deriveTotals({
        baseSalary: emp.salary,
        totalDays: total,
        lopDays,
        bonus: 0,
        otherAdjustment: 0,
      });

      const row = await prisma.employeeSalary.create({
        data: {
          employeeId: emp.id,
          year: y,
          month: m,
          baseSalary: emp.salary,
          totalDays: total,
          presentDays,
          leaveDays,
          absentDays,
          paidLeaves: Number(paidLeaves),
          lopDays,
          ...totals,
        },
      });
      created.push(row);
    }

    return res.status(201).json({
      message: `Generated ${created.length} salary record(s).`,
      created: created.length,
      skippedExisting: existingIds.size,
      skippedNoSalary,
    });
  } catch (err) {
    console.error("Generate salaries error:", err);
    return res.status(500).json({ message: "Could not generate salary records." });
  }
}

// PUT /api/admin/salaries/:id/recalculate
// Re-pulls Attendance for this record's employee/month (useful if
// attendance was corrected after the row was generated), refreshes
// totalDays from the current Working Days config, and re-suggests lopDays
// from the fresh attendance + this row's existing paidLeaves. Keeps
// whatever bonus/otherAdjustment/paidLeaves are already on the row.
export async function recalculate(req, res) {
  try {
    const existing = await prisma.employeeSalary.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Salary record not found." });
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      return res.status(400).json({ message: `Cannot recalculate a ${existing.status} record.` });
    }

    const { presentDays, leaveDays, absentDays } = await computeAttendance(
      existing.employeeId,
      existing.year,
      existing.month
    );
    const { workingDays: totalDays } = await getWorkingDaysSummary(existing.year, existing.month);
    const lopDays = suggestLop({ leaveDays, absentDays, paidLeaves: existing.paidLeaves });
    const totals = deriveTotals({
      baseSalary: existing.baseSalary,
      totalDays,
      lopDays,
      bonus: existing.bonus,
      otherAdjustment: existing.otherAdjustment,
    });

    const updated = await prisma.employeeSalary.update({
      where: { id: req.params.id },
      data: { presentDays, leaveDays, absentDays, lopDays, totalDays, ...totals },
    });

    return res.status(200).json({ salary: updated });
  } catch (err) {
    console.error("Recalculate salary error:", err);
    return res.status(500).json({ message: "Could not recalculate salary record." });
  }
}

// PUT /api/admin/salaries/:id
// Edits the manual fields (baseSalary, paidLeaves, lopDays override, bonus,
// otherAdjustment, notes, status) and always re-derives perDaySalary /
// leaveDeduction / netSalary from the result, so the numbers shown never
// go stale relative to what was just typed in.
export async function updateSalary(req, res) {
  try {
    const existing = await prisma.employeeSalary.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Salary record not found." });
    if (existing.status === "PAID") {
      return res.status(400).json({ message: "This record is marked PAID and is locked. Reopen it first if you need to change it." });
    }

    const {
      baseSalary,
      totalDays,
      paidLeaves,
      lopDays,
      bonus,
      bonusReason,
      otherAdjustment,
      adjustmentNote,
      notes,
      status,
    } = req.body;

    const data = {};
    if (baseSalary !== undefined) data.baseSalary = Number(baseSalary);
    if (totalDays !== undefined) data.totalDays = Number(totalDays);
    if (paidLeaves !== undefined) data.paidLeaves = Number(paidLeaves);
    if (lopDays !== undefined) data.lopDays = Number(lopDays);
    if (bonus !== undefined) data.bonus = Number(bonus);
    if (bonusReason !== undefined) data.bonusReason = bonusReason || null;
    if (otherAdjustment !== undefined) data.otherAdjustment = Number(otherAdjustment);
    if (adjustmentNote !== undefined) data.adjustmentNote = adjustmentNote || null;
    if (notes !== undefined) data.notes = notes || null;
    if (status !== undefined) {
      if (!["DRAFT", "FINALIZED"].includes(status)) {
        return res.status(400).json({ message: "status must be DRAFT or FINALIZED here. Use mark-paid to set PAID." });
      }
      data.status = status;
    }

    // Absent/leave days are auto-treated as LOP. If the admin changed Paid
    // Leaves but didn't also type an explicit LOP override in this same
    // request, re-suggest lopDays from the record's stored attendance
    // (leaveDays + absentDays) and the new paid-leave count — so nudging
    // "Paid Leaves" alone still keeps LOP (and therefore Net Salary) in
    // sync automatically. An explicit lopDays in the request always wins.
    if (paidLeaves !== undefined && lopDays === undefined) {
      data.lopDays = suggestLop({
        leaveDays: existing.leaveDays,
        absentDays: existing.absentDays,
        paidLeaves: data.paidLeaves,
      });
    }

    const merged = { ...existing, ...data };
    const totals = deriveTotals({
      baseSalary: merged.baseSalary,
      totalDays: merged.totalDays,
      lopDays: merged.lopDays,
      bonus: merged.bonus,
      otherAdjustment: merged.otherAdjustment,
    });

    const updated = await prisma.employeeSalary.update({
      where: { id: req.params.id },
      data: { ...data, ...totals },
    });

    return res.status(200).json({ salary: updated });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "A salary record already exists for that employee/month." });
    }
    console.error("Update salary error:", err);
    return res.status(500).json({ message: "Could not update salary record." });
  }
}

// PUT /api/admin/salaries/:id/mark-paid  { paymentMethod?, paidDate? }
export async function markPaid(req, res) {
  try {
    const existing = await prisma.employeeSalary.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Salary record not found." });

    const { paymentMethod, paidDate } = req.body;
    const updated = await prisma.employeeSalary.update({
      where: { id: req.params.id },
      data: {
        status: "PAID",
        paymentMethod: paymentMethod || null,
        paidDate: paidDate ? new Date(paidDate) : new Date(),
      },
    });

    return res.status(200).json({ salary: updated });
  } catch (err) {
    console.error("Mark paid error:", err);
    return res.status(500).json({ message: "Could not mark salary as paid." });
  }
}

// PUT /api/admin/salaries/:id/reopen — unlocks a PAID record back to
// FINALIZED so it can be corrected (e.g. a payment was reversed).
export async function reopenSalary(req, res) {
  try {
    const existing = await prisma.employeeSalary.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Salary record not found." });
    if (existing.status !== "PAID") {
      return res.status(400).json({ message: "Only PAID records need reopening." });
    }

    const updated = await prisma.employeeSalary.update({
      where: { id: req.params.id },
      data: { status: "FINALIZED", paidDate: null, paymentMethod: null },
    });

    return res.status(200).json({ salary: updated });
  } catch (err) {
    console.error("Reopen salary error:", err);
    return res.status(500).json({ message: "Could not reopen salary record." });
  }
}

// DELETE /api/admin/salaries/:id
export async function deleteSalary(req, res) {
  try {
    const existing = await prisma.employeeSalary.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Salary record not found." });
    if (existing.status === "PAID") {
      return res.status(400).json({ message: "Cannot delete a PAID record. Reopen it first if this was a mistake." });
    }

    await prisma.employeeSalary.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: "Salary record removed." });
  } catch (err) {
    console.error("Delete salary error:", err);
    return res.status(500).json({ message: "Could not remove salary record." });
  }
}