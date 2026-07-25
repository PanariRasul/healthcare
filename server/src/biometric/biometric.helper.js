// server/src/biometric/biometric.helper.js
// Pure helper functions — no Prisma calls here, just time math and shaping.
// Kept separate from biometric.service.js so the calculation logic is easy
// to unit-test on its own later.

// ----------------------------------------------------------------------------
// Fallback shift used only when a BiometricMapping has no shiftId assigned.
// Kept as the same 09:00/8-hour default this module always used, so existing
// unassigned mappings keep behaving exactly as before Shift Management
// existed. Once an admin assigns a real Shift (Working Timings & Shift
// Management page) to a mapping, that Shift's own numbers are used instead.
// ----------------------------------------------------------------------------
export const DEFAULT_SHIFT_START_MINUTES = 9 * 60; // 09:00
export const DEFAULT_FULL_DAY_MINUTES = 8 * 60; // 480
export const DEFAULT_GRACE_MINUTES = 10; // no "late" penalty inside this window

export const DEFAULT_SHIFT = {
  id: null,
  name: "Default (Unassigned)",
  code: "DEFAULT",
  type: "GENERAL",
  startTime: "09:00",
  endTime: "17:00",
  graceBeforeMinutes: DEFAULT_GRACE_MINUTES,
  graceAfterMinutes: DEFAULT_GRACE_MINUTES,
  breakMinutes: 0,
  overtimeAfterMinutes: 0,
  totalWorkingMinutes: DEFAULT_FULL_DAY_MINUTES,
  isActive: true,
};

// A day worked below this fraction of the shift's total working minutes is
// HALF_DAY instead of PRESENT.
export const HALF_DAY_FRACTION = 0.5;

// Treat two punches from the same device+enrollmentId within this window as
// the same physical punch (duplicate press / device retry), not a new event.
export const DUPLICATE_PUNCH_WINDOW_SECONDS = 60;

// Midnight of the given date, in UTC-safe terms — used as the Attendance.date key.
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function minutesBetween(from, to) {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
}

// Minutes since midnight (local to the stored DateTime) for a given punch.
function minutesSinceMidnight(date) {
  const d = new Date(date);
  return d.getHours() * 60 + d.getMinutes();
}

// "08:00" -> 480. Returns null for anything unparseable so callers can
// validate and reject bad input rather than silently computing garbage.
export function timeStringToMinutes(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToTimeString(totalMinutes) {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// A shift is "overnight" when its end clock-time is not after its start
// clock-time (e.g. 20:00 -> 08:00). Same-time start/end (0-length) is not a
// valid shift and should be rejected before it gets here.
export function isOvernightShift(shift) {
  const start = timeStringToMinutes(shift.startTime);
  const end = timeStringToMinutes(shift.endTime);
  if (start === null || end === null) return false;
  return end <= start;
}

// Total scheduled span of the shift in minutes, before subtracting the
// break — i.e. actual clock-in to clock-out duration.
export function shiftSpanMinutes(shift) {
  const start = timeStringToMinutes(shift.startTime);
  const end = timeStringToMinutes(shift.endTime);
  if (start === null || end === null) return 0;
  return end <= start ? 1440 - start + end : end - start;
}

// Working hours after the (optional) unpaid break is subtracted — this is
// what gets stored as Shift.totalWorkingMinutes.
export function computeShiftWorkingMinutes(shift) {
  return Math.max(0, shiftSpanMinutes(shift) - (Number(shift.breakMinutes) || 0));
}

// ----------------------------------------------------------------------------
// Overnight-aware attendance bucketing.
//
// A normal (same-day) shift buckets a punch into the calendar day it fell
// on, same as always. An overnight shift (e.g. 20:00 -> 08:00) instead
// buckets by which "shift day" the punch belongs to: an early-morning punch
// (before noon) is the tail end of the PREVIOUS calendar day's shift, not
// the start of a new one — otherwise a checkout at 2 AM would silently open
// a second, mostly-empty Attendance row instead of completing the evening
// shift it belongs to.
// ----------------------------------------------------------------------------
export function resolveAttendanceDate(punchDateTime, shift) {
  const day = startOfDay(punchDateTime);
  if (!isOvernightShift(shift)) return day;

  const NOON_MINUTES = 12 * 60;
  const punchMinutes = minutesSinceMidnight(punchDateTime);
  return punchMinutes < NOON_MINUTES ? addDays(day, -1) : day;
}

// Given a shift and the calendar day its evening portion started on,
// returns the shift's scheduled start/end as real Date instants (end may
// land on the next calendar day for overnight shifts).
export function shiftWindowForDate(shiftDay, shift) {
  const start = timeStringToMinutes(shift.startTime) ?? 0;
  const span = shiftSpanMinutes(shift);
  const shiftStart = new Date(shiftDay);
  shiftStart.setMinutes(shiftStart.getMinutes() + start);
  const shiftEnd = new Date(shiftStart);
  shiftEnd.setMinutes(shiftEnd.getMinutes() + span);
  return { shiftStart, shiftEnd };
}

// Given the current first/last punch pair for an attendance day, plus the
// shift they should be measured against, compute workingMinutes,
// lateMinutes, earlyExitMinutes, overtimeMinutes, and a status.
// `shiftDay` is the Attendance.date bucket (from resolveAttendanceDate) —
// needed to anchor the shift's start/end to real instants for overnight math.
export function computeAttendanceMetrics(firstPunch, lastPunch, shift = DEFAULT_SHIFT, shiftDay = null) {
  if (!firstPunch || !lastPunch) {
    return { workingMinutes: 0, lateMinutes: 0, earlyExitMinutes: 0, overtimeMinutes: 0, status: "ABSENT" };
  }

  const day = shiftDay || startOfDay(firstPunch);
  const { shiftStart, shiftEnd } = shiftWindowForDate(day, shift);

  const rawWorkingMinutes = minutesBetween(firstPunch, lastPunch);
  const workingMinutes = Math.max(0, rawWorkingMinutes - (Number(shift.breakMinutes) || 0));

  // Late arrival: punching in after (shift start + grace-after) is late.
  // Punching in up to graceBeforeMinutes early is simply on time, never
  // "negative late."
  const graceAfter = Number(shift.graceAfterMinutes) || 0;
  const onTimeDeadline = new Date(shiftStart.getTime() + graceAfter * 60000);
  const lateMinutes = firstPunch > onTimeDeadline ? minutesBetween(onTimeDeadline, firstPunch) : 0;

  // Early exit: leaving before shift end is an early exit, full stop — the
  // configured grace windows are about the START of the shift only.
  const earlyExitMinutes = lastPunch < shiftEnd ? minutesBetween(lastPunch, shiftEnd) : 0;

  // Overtime: time worked past (shift end + overtimeAfterMinutes buffer).
  const otBuffer = Number(shift.overtimeAfterMinutes) || 0;
  const otThreshold = new Date(shiftEnd.getTime() + otBuffer * 60000);
  const overtimeMinutes = lastPunch > otThreshold ? minutesBetween(otThreshold, lastPunch) : 0;

  const totalShiftMinutes = shift.totalWorkingMinutes || computeShiftWorkingMinutes(shift);
  let status = "PRESENT";
  if (workingMinutes === 0) status = "ABSENT";
  else if (totalShiftMinutes > 0 && workingMinutes < totalShiftMinutes * HALF_DAY_FRACTION) status = "HALF_DAY";

  return { workingMinutes, lateMinutes, earlyExitMinutes, overtimeMinutes, status };
}

// Strip nothing sensitive currently lives on these models, but keeping this
// helper mirrors the toSafeUser() pattern used elsewhere in the codebase in
// case fields like an API secret get added to BiometricDevice later.
export function toSafeDevice(device) {
  return device;
}

export function parseDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return startOfDay(d);
}

export function pagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}


// Parses device timestamp like:
// "2026-06-26 09:15:00"
// and treats it as IST instead of UTC.
export function parseIST(value) {
  if (!value) return null;

  if (value instanceof Date) return value;

  const str = String(value).trim();

  const match = str.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
  );

  if (match) {
    const [, y, m, d, hh, mm, ss = "0"] = match;

    // Store exactly what the device sends (IST local time)
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss)
    );
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}