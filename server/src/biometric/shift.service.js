// server/src/biometric/shift.service.js
//
// Working Timings & Shift Management. A Shift defines the schedule
// attendance is calculated against (see biometric.helper.js for the actual
// time math). This file is just CRUD + validation; assignShiftToMapping is
// the one bit of cross-module wiring — it's what actually puts a mapping
// (and therefore a person's attendance) "on" a shift.
import prisma from "../lib/prisma.js";
import {
  timeStringToMinutes,
  computeShiftWorkingMinutes,
  shiftSpanMinutes,
  pagination,
} from "./biometric.helper.js";

const VALID_TYPES = ["DAY", "NIGHT", "GENERAL"];

function toNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  if (value === undefined || value === null || value === "") return fallback;
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n);
}

// Validates + normalizes the create/update payload. Returns { data, error }
// rather than throwing so both createShift and updateShift can reuse it
// against their own required-field rules.
function normalizeShiftInput(body, { requireCore }) {
  const { name, code, type, startTime, endTime, description, isActive } = body;
  const data = {};

  if (requireCore || name !== undefined) {
    if (!name || !String(name).trim()) return { error: "Shift name is required." };
    data.name = String(name).trim();
  }
  if (requireCore || code !== undefined) {
    if (!code || !String(code).trim()) return { error: "Shift code is required." };
    data.code = String(code).trim().toUpperCase();
  }
  if (requireCore || type !== undefined) {
    const t = type || "GENERAL";
    if (!VALID_TYPES.includes(t)) return { error: `type must be one of ${VALID_TYPES.join(", ")}` };
    data.type = t;
  }

  let startMin, endMin;
  if (requireCore || startTime !== undefined) {
    startMin = timeStringToMinutes(startTime);
    if (startMin === null) return { error: "Shift Start Time must be a valid HH:mm value." };
    data.startTime = startTime;
  }
  if (requireCore || endTime !== undefined) {
    endMin = timeStringToMinutes(endTime);
    if (endMin === null) return { error: "Shift End Time must be a valid HH:mm value." };
    data.endTime = endTime;
  }
  if (data.startTime !== undefined && data.endTime !== undefined && startMin === endMin) {
    return { error: "Start Time and End Time can't be the same — that's a zero-length shift." };
  }

  const graceBeforeMinutes = toNonNegativeInt(body.graceBeforeMinutes, requireCore ? 0 : undefined);
  if (graceBeforeMinutes === null) return { error: "Grace Time Before Shift must be a non-negative number of minutes." };
  if (graceBeforeMinutes !== undefined) data.graceBeforeMinutes = graceBeforeMinutes;

  const graceAfterMinutes = toNonNegativeInt(body.graceAfterMinutes, requireCore ? 0 : undefined);
  if (graceAfterMinutes === null) return { error: "Grace Time After Shift must be a non-negative number of minutes." };
  if (graceAfterMinutes !== undefined) data.graceAfterMinutes = graceAfterMinutes;

  const breakMinutes = toNonNegativeInt(body.breakMinutes, requireCore ? 0 : undefined);
  if (breakMinutes === null) return { error: "Break Duration must be a non-negative number of minutes." };
  if (breakMinutes !== undefined) data.breakMinutes = breakMinutes;

  const overtimeAfterMinutes = toNonNegativeInt(body.overtimeAfterMinutes, requireCore ? 0 : undefined);
  if (overtimeAfterMinutes === null) return { error: "Overtime Starts After must be a non-negative number of minutes." };
  if (overtimeAfterMinutes !== undefined) data.overtimeAfterMinutes = overtimeAfterMinutes;

  if (description !== undefined) data.description = description || null;
  if (isActive !== undefined) data.isActive = Boolean(isActive);

  return { data };
}

// Recomputes totalWorkingMinutes from whatever start/end/break values are
// about to be saved, merged over the existing row when only some fields
// were edited.
function withTotalWorkingMinutes(merged) {
  const span = shiftSpanMinutes(merged);
  if (span <= (Number(merged.breakMinutes) || 0)) {
    return { error: "Break Duration can't be longer than the shift itself." };
  }
  return { totalWorkingMinutes: computeShiftWorkingMinutes(merged) };
}

export async function listShifts({ search = "", status, page: pageQ, limit: limitQ } = {}) {
  const where = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status === "active") where.isActive = true;
  if (status === "inactive") where.isActive = false;

  const { page, limit, skip } = pagination({ page: pageQ, limit: limitQ });

  const [shifts, total] = await Promise.all([
    prisma.shift.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { _count: { select: { mappings: true } } },
    }),
    prisma.shift.count({ where }),
  ]);

  return { shifts, total, page, limit };
}

// Summary cards — computed over ALL shifts, independent of the current
// search/filter/pagination on the table below it.
export async function getShiftSummary() {
  const [totalShifts, activeShifts, employeesAssigned, activeShiftRows] = await Promise.all([
    prisma.shift.count(),
    prisma.shift.count({ where: { isActive: true } }),
    prisma.biometricMapping.count({ where: { isActive: true, shiftId: { not: null } } }),
    prisma.shift.findMany({ where: { isActive: true }, select: { totalWorkingMinutes: true } }),
  ]);

  const avgWorkingHours = activeShiftRows.length
    ? Math.round(
        (activeShiftRows.reduce((sum, s) => sum + s.totalWorkingMinutes, 0) / activeShiftRows.length / 60) * 10
      ) / 10
    : 0;

  return { totalShifts, activeShifts, employeesAssigned, avgWorkingHours };
}

export async function getShiftById(id) {
  const shift = await prisma.shift.findUnique({
    where: { id },
    include: { _count: { select: { mappings: true } } },
  });
  if (!shift) {
    const err = new Error("Shift not found.");
    err.status = 404;
    throw err;
  }
  return shift;
}

export async function createShift(body) {
  const { data, error } = normalizeShiftInput(body, { requireCore: true });
  if (error) {
    const err = new Error(error);
    err.status = 400;
    throw err;
  }

  const totals = withTotalWorkingMinutes(data);
  if (totals.error) {
    const err = new Error(totals.error);
    err.status = 400;
    throw err;
  }

  try {
    return await prisma.shift.create({ data: { ...data, ...totals } });
  } catch (err) {
    if (err.code === "P2002") {
      const dup = new Error("A shift with that code already exists.");
      dup.status = 409;
      throw dup;
    }
    throw err;
  }
}

export async function updateShift(id, body) {
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error("Shift not found.");
    err.status = 404;
    throw err;
  }

  const { data, error } = normalizeShiftInput(body, { requireCore: false });
  if (error) {
    const err = new Error(error);
    err.status = 400;
    throw err;
  }

  const merged = { ...existing, ...data };
  const totals = withTotalWorkingMinutes(merged);
  if (totals.error) {
    const err = new Error(totals.error);
    err.status = 400;
    throw err;
  }

  try {
    return await prisma.shift.update({ where: { id }, data: { ...data, ...totals } });
  } catch (err) {
    if (err.code === "P2002") {
      const dup = new Error("A shift with that code already exists.");
      dup.status = 409;
      throw dup;
    }
    throw err;
  }
}

export async function toggleShift(id) {
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error("Shift not found.");
    err.status = 404;
    throw err;
  }
  return prisma.shift.update({ where: { id }, data: { isActive: !existing.isActive } });
}

// Hard delete is only safe when nothing currently points at this shift —
// same "block deletion when in use" pattern as Category/medicine.
export async function deleteShift(id) {
  const existing = await prisma.shift.findUnique({
    where: { id },
    include: { _count: { select: { mappings: true, attendances: true } } },
  });
  if (!existing) {
    const err = new Error("Shift not found.");
    err.status = 404;
    throw err;
  }
  if (existing._count.mappings > 0 || existing._count.attendances > 0) {
    const err = new Error(
      "This shift is assigned to employees or has attendance history. Deactivate it instead of deleting it."
    );
    err.status = 400;
    throw err;
  }

  await prisma.shift.delete({ where: { id } });
  return { message: "Shift removed." };
}

// PATCH /biometric/mappings/:id/shift  { shiftId }
// shiftId may be null/omitted to unassign — that just puts the mapping back
// on the implicit DEFAULT_SHIFT fallback (see biometric.helper.js).
export async function assignShiftToMapping(mappingId, shiftId) {
  const mapping = await prisma.biometricMapping.findUnique({ where: { id: mappingId } });
  if (!mapping) {
    const err = new Error("Mapping not found.");
    err.status = 404;
    throw err;
  }

  if (shiftId) {
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
  }

  return prisma.biometricMapping.update({
    where: { id: mappingId },
    data: { shiftId: shiftId || null },
  });
}