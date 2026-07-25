// server/src/admin/employee-shift.controller.js
//
// Backs the Employee Shift Assignment page. Distinct from the Shift
// Management CRUD (shift.controller.js in the biometric module, which
// defines what a shift IS) — this file is about which employee is on which
// shift right now, changing that in bulk or one at a time, and keeping an
// audit trail of every change (ShiftAssignmentHistory).
import prisma from "../lib/prisma.js";

// GET /api/admin/employee-shifts?search=&department=&shiftType=&page=&limit=
// shiftType accepts a Shift.type value (DAY/NIGHT/GENERAL) or "UNASSIGNED".
// Summary cards are computed over ALL employees, independent of the
// current search/filter/pagination — same convention as the Shifts tab.
export async function listEmployeeShifts(req, res) {
  try {
    const { search = "", department, shiftType, page: pageQ, limit: limitQ } = req.query;

    const where = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { id: { contains: search, mode: "insensitive" } },
      ];
    }
    if (department) where.department = department;
    if (shiftType === "UNASSIGNED") where.shiftId = null;
    else if (shiftType) where.shift = { is: { type: shiftType } };

    const page = Math.max(1, parseInt(pageQ, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitQ, 10) || 10));
    const skip = (page - 1) * limit;

    const [
      employees,
      total,
      totalEmployees,
      dayShiftEmployees,
      nightShiftEmployees,
      unassignedEmployees,
      departmentRows,
    ] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: { shift: true },
        orderBy: { fullName: "asc" },
        skip,
        take: limit,
      }),
      prisma.employee.count({ where }),
      prisma.employee.count(),
      prisma.employee.count({ where: { shift: { is: { type: "DAY" } } } }),
      prisma.employee.count({ where: { shift: { is: { type: "NIGHT" } } } }),
      prisma.employee.count({ where: { shiftId: null } }),
      prisma.employee.findMany({
        where: { department: { not: null } },
        select: { department: true },
        distinct: ["department"],
      }),
    ]);

    return res.status(200).json({
      employees,
      total,
      page,
      limit,
      summary: { totalEmployees, dayShiftEmployees, nightShiftEmployees, unassignedEmployees },
      departments: departmentRows.map((d) => d.department).filter(Boolean),
    });
  } catch (err) {
    console.error("List employee shifts error:", err);
    return res.status(500).json({ message: "Could not fetch employee shift assignments." });
  }
}

// GET /api/admin/employee-shifts/:id/history
export async function getShiftHistory(req, res) {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) return res.status(404).json({ message: "Employee not found." });

    const history = await prisma.shiftAssignmentHistory.findMany({
      where: { employeeId: req.params.id },
      include: {
        previousShift: { select: { id: true, name: true, type: true } },
        newShift: { select: { id: true, name: true, type: true } },
        changedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { changedAt: "desc" },
    });

    return res.status(200).json({ employee, history });
  } catch (err) {
    console.error("Get shift history error:", err);
    return res.status(500).json({ message: "Could not fetch shift history." });
  }
}

async function assertShiftIsAssignable(shiftId) {
  if (!shiftId) return null; // unassigning is always allowed
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) {
    const err = new Error("Shift not found.");
    err.status = 404;
    throw err;
  }
  if (!shift.isActive) {
    const err = new Error("Can't assign an inactive shift. Activate it first.");
    err.status = 400;
    throw err;
  }
  return shift;
}

// PUT /api/admin/employee-shifts/:id  { shiftId }
// Single-employee change. shiftId may be omitted/null to unassign.
export async function assignShift(req, res) {
  try {
    const { id } = req.params;
    const { shiftId } = req.body;

    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) return res.status(404).json({ message: "Employee not found." });

    const shift = await assertShiftIsAssignable(shiftId);

    const previousShiftId = employee.shiftId || null;
    const nextShiftId = shift?.id || null;
    if (previousShiftId === nextShiftId) {
      return res.status(400).json({ message: "That employee is already on this shift." });
    }

    const now = new Date();
    const [updated] = await prisma.$transaction([
      prisma.employee.update({
        where: { id },
        data: { shiftId: nextShiftId, shiftAssignedAt: now },
        include: { shift: true },
      }),
      prisma.shiftAssignmentHistory.create({
        data: {
          employeeId: id,
          previousShiftId,
          newShiftId: nextShiftId,
          changedById: req.user?.id || null,
          changedAt: now,
        },
      }),
    ]);

    return res.status(200).json({ employee: updated });
  } catch (err) {
    const code = err.status || 500;
    if (code === 500) console.error("Assign shift error:", err);
    return res.status(code).json({ message: err.message || "Could not assign shift." });
  }
}

// POST /api/admin/employee-shifts/bulk-assign  { employeeIds: [...], shiftId }
// Bulk version — moves every listed employee onto the same shift in one
// transaction per changed employee, and records one history row each so
// the audit trail reads the same as if they'd been changed individually.
export async function bulkAssignShift(req, res) {
  try {
    const { employeeIds, shiftId } = req.body;
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: "Select at least one employee." });
    }
    if (!shiftId) {
      return res.status(400).json({ message: "Choose a shift to assign." });
    }

    const shift = await assertShiftIsAssignable(shiftId);

    const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } } });
    if (employees.length === 0) {
      return res.status(404).json({ message: "No matching employees found." });
    }

    const now = new Date();
    const changedById = req.user?.id || null;

    const ops = [];
    let unchanged = 0;
    for (const emp of employees) {
      if ((emp.shiftId || null) === shift.id) {
        unchanged += 1;
        continue;
      }
      ops.push(
        prisma.employee.update({ where: { id: emp.id }, data: { shiftId: shift.id, shiftAssignedAt: now } }),
        prisma.shiftAssignmentHistory.create({
          data: {
            employeeId: emp.id,
            previousShiftId: emp.shiftId || null,
            newShiftId: shift.id,
            changedById,
            changedAt: now,
          },
        })
      );
    }

    if (ops.length > 0) await prisma.$transaction(ops);

    const updatedCount = employees.length - unchanged;
    return res.status(200).json({
      message:
        `Assigned ${updatedCount} employee(s) to ${shift.name}.` +
        (unchanged ? ` ${unchanged} were already on that shift.` : ""),
      updated: updatedCount,
      unchanged,
    });
  } catch (err) {
    const code = err.status || 500;
    if (code === 500) console.error("Bulk assign shift error:", err);
    return res.status(code).json({ message: err.message || "Could not bulk-assign shift." });
  }
}