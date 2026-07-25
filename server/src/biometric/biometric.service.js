// server/src/biometric/biometric.service.js
import prisma from "../lib/prisma.js";
import {
  startOfDay,
  parseIST,
  computeAttendanceMetrics,
  resolveAttendanceDate,
  toSafeDevice,
  parseDateOnly,
  pagination,
  DUPLICATE_PUNCH_WINDOW_SECONDS,
  DEFAULT_SHIFT,
} from "./biometric.helper.js";

// ============================================================================
// Devices
// ============================================================================

export async function listDevices({ search = "" } = {}) {
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { deviceCode: { contains: search, mode: "insensitive" } },
          { serialNumber: { contains: search, mode: "insensitive" } },
          { location: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};
  const devices = await prisma.biometricDevice.findMany({ where, orderBy: { createdAt: "desc" } });
  return devices.map(toSafeDevice);
}

export async function getDeviceById(id) {
  return prisma.biometricDevice.findUnique({ where: { id } });
}

export async function createDevice({ name, deviceCode, serialNumber, location }) {
  if (!name || !deviceCode || !serialNumber) {
    const err = new Error("name, deviceCode, and serialNumber are required.");
    err.status = 400;
    throw err;
  }
  return prisma.biometricDevice.create({
    data: { name, deviceCode, serialNumber, location: location || null },
  });
}

export async function updateDevice(id, data) {
  const existing = await prisma.biometricDevice.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error("Device not found.");
    err.status = 404;
    throw err;
  }

  const update = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.deviceCode !== undefined) update.deviceCode = data.deviceCode;
  if (data.serialNumber !== undefined) update.serialNumber = data.serialNumber;
  if (data.location !== undefined) update.location = data.location || null;
  if (data.isActive !== undefined) update.isActive = Boolean(data.isActive);

  return prisma.biometricDevice.update({ where: { id }, data: update });
}

export async function toggleDevice(id) {
  const existing = await prisma.biometricDevice.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error("Device not found.");
    err.status = 404;
    throw err;
  }
  return prisma.biometricDevice.update({
    where: { id },
    data: { isActive: !existing.isActive },
  });
}

// ============================================================================
// Mappings
// ============================================================================

export async function listMappings({ search = "", deviceId, isActive } = {}) {
  const where = {};
  if (deviceId) where.deviceId = deviceId;
  if (isActive !== undefined) where.isActive = isActive === "true" || isActive === true;
  if (search) where.biometricId = { contains: search, mode: "insensitive" };

  const mappings = await prisma.biometricMapping.findMany({
    where,
    include: { device: true, shift: true },
    orderBy: { createdAt: "desc" },
  });

  // userId/employeeId are plain scalars (not Prisma relations — see schema
  // notes), so we resolve the linked person manually rather than via include.
  const userIds = mappings.filter((m) => m.userId).map((m) => m.userId);
  const employeeIds = mappings.filter((m) => m.employeeId).map((m) => m.employeeId);

  const [users, employees] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, email: true, phone: true, role: true },
        })
      : [],
    employeeIds.length
      ? prisma.employee.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, fullName: true, designation: true, phone: true },
        })
      : [],
  ]);
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const employeeMap = Object.fromEntries(employees.map((e) => [e.id, e]));

  return mappings.map((m) => ({
    ...m,
    user: m.userId ? userMap[m.userId] || null : null,
    employee: m.employeeId ? employeeMap[m.employeeId] || null : null,
  }));
}

export async function createMapping({ biometricId, deviceId, userId, employeeId, shiftId }) {
  if (!biometricId || !deviceId) {
    const err = new Error("biometricId and deviceId are required.");
    err.status = 400;
    throw err;
  }
  if ((userId && employeeId) || (!userId && !employeeId)) {
    const err = new Error("Provide exactly one of userId or employeeId, never both or neither.");
    err.status = 400;
    throw err;
  }

  const device = await prisma.biometricDevice.findUnique({ where: { id: deviceId } });
  if (!device) {
    const err = new Error("Device not found.");
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
  }

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      const err = new Error("User not found.");
      err.status = 404;
      throw err;
    }
  }
  if (employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      const err = new Error("Employee not found.");
      err.status = 404;
      throw err;
    }
  }

  try {
    return await prisma.biometricMapping.create({
      data: { biometricId, deviceId, userId: userId || null, employeeId: employeeId || null, shiftId: shiftId || null },
    });
  } catch (err) {
    if (err.code === "P2002") {
      const dup = new Error("This biometric ID is already mapped to someone.");
      dup.status = 409;
      throw dup;
    }
    throw err;
  }
}

export async function deactivateMapping(id) {
  const existing = await prisma.biometricMapping.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error("Mapping not found.");
    err.status = 404;
    throw err;
  }
  return prisma.biometricMapping.update({ where: { id }, data: { isActive: false } });
}

// ============================================================================
// Search (used by the User Mapping / Employee Mapping tabs to find who to map)
// ============================================================================

export async function searchUsers(search = "") {
  const where = search
    ? {
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};
  return prisma.user.findMany({
    where,
    select: { id: true, fullName: true, email: true, phone: true, role: true, isActive: true },
    take: 20,
    orderBy: { fullName: "asc" },
  });
}

export async function searchEmployees(search = "") {
  const where = search
    ? {
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { designation: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};
  return prisma.employee.findMany({
    where,
    select: { id: true, fullName: true, designation: true, phone: true, isActive: true },
    take: 20,
    orderBy: { fullName: "asc" },
  });
}

// ============================================================================
// Punch ingestion — the core of the module
// ============================================================================

// Devices authenticate simply by sending their own registered serial number.
// There's no separate secret/API-key field on BiometricDevice yet (that's a
// reasonable Phase-2-later hardening step) — for now, a punch is accepted
// only if deviceSerial matches an ACTIVE, already-registered device, which at
// least stops punches from being attributed to devices you haven't set up.
//
// IMPORTANT — field names: the physical device (and the gateway that
// forwards its payload unchanged) sends its OWN raw field names, not our
// internal ones. These match what the working HR biometric module already
// accepts (see hr_biometric.controller.js), so we mirror that mapping here
// instead of requiring callers to pre-transform the payload:
//
//   SerialNo              -> deviceSerial
//   EnrollmentId/ID       -> enrollmentId
//   PunchMode             -> punchMode
//   PunchDateAndTime      -> punchTime (parsed as IST, see parseIST)
//
// We still accept the old internal names (deviceSerial, enrollmentId,
// punchTime, punchMode) as a fallback, in case anything calls this directly
// with the already-normalized shape.
export async function processPunch(payload = {}) {
  const deviceSerial =
    payload.SerialNo ?? payload.serialNo ?? payload.SerialNumber ?? payload.deviceSerial ?? null;

  const enrollmentId =
    payload.EnrollmentId ?? payload.EnrollmentID ?? payload.enrollmentId ?? null;

  const punchModeRaw = payload.PunchMode ?? payload.punchMode ?? null;

  // Device sends unmarked IST timestamps (e.g. "2026-06-26 09:15:00").
  // A bare `new Date(...)` would misread that as UTC — use the same
  // IST-safe parser the working HR module uses.
  const punchTimeRaw = payload.PunchDateAndTime ?? payload.punchTime ?? null;

  const raw = payload.raw ?? payload;

  console.log("[processPunch] extracted:", {
    deviceSerial,
    enrollmentId,
    punchModeRaw,
    punchTimeRaw,
    receivedKeys: Object.keys(payload),
  });

  if (!deviceSerial || !enrollmentId) {
    console.error("[processPunch] REJECTED — missing deviceSerial or enrollmentId.", {
      deviceSerial,
      enrollmentId,
      receivedKeys: Object.keys(payload),
      fullPayload: payload,
    });
    const err = new Error("deviceSerial (SerialNo) and enrollmentId (EnrollmentId) are required.");
    err.status = 400;
    throw err;
  }

  const device = await prisma.biometricDevice.findUnique({ where: { serialNumber: deviceSerial } });
  if (!device || !device.isActive) {
    const err = new Error("Unknown or inactive device.");
    err.status = 403;
    throw err;
  }

  const punchDateTime = punchTimeRaw ? parseIST(punchTimeRaw) : new Date();
  if (!punchDateTime) {
    const err = new Error("punchTime is not a valid date.");
    err.status = 400;
    throw err;
  }
  const punchMode = ["IN", "OUT"].includes(punchModeRaw) ? punchModeRaw : "UNKNOWN";
  const mode = punchMode;
  const enrollmentIdStr = String(enrollmentId);

  // ---- Duplicate punch guard ----
  const windowStart = new Date(punchDateTime.getTime() - DUPLICATE_PUNCH_WINDOW_SECONDS * 1000);
  const windowEnd = new Date(punchDateTime.getTime() + DUPLICATE_PUNCH_WINDOW_SECONDS * 1000);
  const duplicate = await prisma.biometricLog.findFirst({
    where: {
      deviceId: device.id,
      enrollmentId: enrollmentIdStr,
      punchTime: { gte: windowStart, lte: windowEnd },
    },
  });
  if (duplicate) {
    return { status: "duplicate", message: "Duplicate punch ignored.", log: duplicate };
  }

  // ---- Resolve mapping (auto-detect User vs Employee) ----
  const mapping = await prisma.biometricMapping.findFirst({
    where: { biometricId: enrollmentIdStr, isActive: true },
  });

  // Attendance is calculated against the mapping's assigned Shift; an
  // unassigned mapping falls back to the implicit default shift so existing
  // behavior doesn't change until an admin actually assigns one.
  const assignedShift = mapping?.shiftId
    ? await prisma.shift.findUnique({ where: { id: mapping.shiftId } })
    : null;
  const shift = assignedShift || DEFAULT_SHIFT;

  const result = await prisma.$transaction(async (tx) => {
    const log = await tx.biometricLog.create({
      data: {
        deviceId: device.id,
        deviceSerial: device.serialNumber,
        enrollmentId: enrollmentIdStr,
        punchTime: punchDateTime,
        punchMode: mode,
        rawData: raw || {},
        isProcessed: Boolean(mapping),
      },
    });

    if (!mapping) {
      return { status: "unmapped", message: "Punch logged, but no active mapping exists for this ID.", log };
    }

    const date = resolveAttendanceDate(punchDateTime, shift);
    const existing = await tx.attendance.findFirst({
      where: { userId: mapping.userId, employeeId: mapping.employeeId, date },
    });

    const firstPunch = existing?.firstPunch && existing.firstPunch < punchDateTime ? existing.firstPunch : (existing?.firstPunch ?? punchDateTime);
    const lastPunch = existing?.lastPunch && existing.lastPunch > punchDateTime ? existing.lastPunch : punchDateTime;
    const metrics = computeAttendanceMetrics(firstPunch, lastPunch, shift, date);

    const attendanceData = {
      userId: mapping.userId,
      employeeId: mapping.employeeId,
      mappingId: mapping.id,
      deviceId: device.id,
      shiftId: assignedShift?.id || null,
      date,
      firstPunch,
      lastPunch,
      ...metrics,
    };

    const attendance = existing
      ? await tx.attendance.update({ where: { id: existing.id }, data: attendanceData })
      : await tx.attendance.create({ data: attendanceData });

    return { status: "ok", message: "Punch processed.", log, attendance };
  });

  return result;
}

// ============================================================================
// Punch logs (for the Attendance Logs tab)
// ============================================================================

export async function listLogs({ date, deviceId, mapped, page: pageQ, limit: limitQ } = {}) {
  const where = {};
  if (date) {
    const day = parseDateOnly(date);
    if (day) {
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      where.punchTime = { gte: day, lt: nextDay };
    }
  }
  if (deviceId) where.deviceId = deviceId;
  if (mapped === "true") where.isProcessed = true;
  if (mapped === "false") where.isProcessed = false;

  const { page, limit, skip } = pagination({ page: pageQ, limit: limitQ });

  const [logs, total] = await Promise.all([
    prisma.biometricLog.findMany({
      where,
      include: { device: true },
      orderBy: { punchTime: "desc" },
      skip,
      take: limit,
    }),
    prisma.biometricLog.count({ where }),
  ]);

  return { logs, total, page, limit };
}

// ============================================================================
// Attendance (for the Attendance Report tab)
// ============================================================================

export async function listAttendance({ date, from, to, userId, employeeId, page: pageQ, limit: limitQ } = {}) {
  const where = {};
  if (userId) where.userId = userId;
  if (employeeId) where.employeeId = employeeId;

  if (date) {
    const day = parseDateOnly(date);
    if (day) where.date = day;
  } else if (from || to) {
    where.date = {};
    if (from) where.date.gte = parseDateOnly(from);
    if (to) where.date.lte = parseDateOnly(to);
  }

  const { page, limit, skip } = pagination({ page: pageQ, limit: limitQ });

  const [records, total] = await Promise.all([
    prisma.attendance.findMany({ where, orderBy: { date: "desc" }, skip, take: limit }),
    prisma.attendance.count({ where }),
  ]);

  const records2 = await attachPersonNames(records);
  return { records: records2, total, page, limit };
}

export async function attendanceReport({ from, to, userId, employeeId } = {}) {
  const where = {};
  if (userId) where.userId = userId;
  if (employeeId) where.employeeId = employeeId;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = parseDateOnly(from);
    if (to) where.date.lte = parseDateOnly(to);
  }

  const records = await prisma.attendance.findMany({ where, orderBy: { date: "asc" } });
  const withNames = await attachPersonNames(records);

  const summary = withNames.reduce(
    (acc, r) => {
      acc.totalWorkingMinutes += r.workingMinutes;
      acc.totalLateMinutes += r.lateMinutes;
      acc.totalOvertimeMinutes += r.overtimeMinutes;
      if (r.status === "PRESENT") acc.presentDays += 1;
      else if (r.status === "ABSENT") acc.absentDays += 1;
      else if (r.status === "HALF_DAY") acc.halfDays += 1;
      else if (r.status === "ON_LEAVE") acc.leaveDays += 1;
      return acc;
    },
    { presentDays: 0, absentDays: 0, halfDays: 0, leaveDays: 0, totalWorkingMinutes: 0, totalLateMinutes: 0, totalOvertimeMinutes: 0 }
  );

  return { records: withNames, summary };
}

async function attachPersonNames(records) {
  const userIds = [...new Set(records.filter((r) => r.userId).map((r) => r.userId))];
  const employeeIds = [...new Set(records.filter((r) => r.employeeId).map((r) => r.employeeId))];

  const [users, employees] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, role: true } }) : [],
    employeeIds.length ? prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, fullName: true, designation: true } }) : [],
  ]);
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const employeeMap = Object.fromEntries(employees.map((e) => [e.id, e]));

  return records.map((r) => ({
    ...r,
    person: r.userId ? userMap[r.userId] || null : r.employeeId ? employeeMap[r.employeeId] || null : null,
    personType: r.userId ? "USER" : r.employeeId ? "EMPLOYEE" : null,
  }));
}

// ============================================================================
// Dashboard
// ============================================================================

export async function getDashboard() {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    totalDevices,
    activeDevices,
    mappedUsers,
    mappedEmployees,
    todaysPunches,
    presentToday,
  ] = await Promise.all([
    prisma.biometricDevice.count(),
    prisma.biometricDevice.count({ where: { isActive: true } }),
    prisma.biometricMapping.count({ where: { isActive: true, userId: { not: null } } }),
    prisma.biometricMapping.count({ where: { isActive: true, employeeId: { not: null } } }),
    prisma.biometricLog.count({ where: { punchTime: { gte: today, lt: tomorrow } } }),
    prisma.attendance.count({ where: { date: today, status: "PRESENT" } }),
  ]);

  // Absent is approximated as "everyone mapped, minus everyone marked present
  // today." Without a Shift/roster module there's no authoritative expected
  // headcount per day, so this is a best-effort figure, not exact truth.
  const totalMapped = mappedUsers + mappedEmployees;
  const absentToday = Math.max(0, totalMapped - presentToday);

  return {
    totalDevices,
    activeDevices,
    mappedUsers,
    mappedEmployees,
    todaysPunches,
    presentToday,
    absentToday,
  };
}