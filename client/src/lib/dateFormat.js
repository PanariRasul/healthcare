// client/src/lib/dateFormat.js
//
// One place for every date the clinic sees. Everything on screen and on
// paper is dd/mm/yyyy — no locale guessing, no "1/2/2026" ambiguity.
//
// Two shapes are in play throughout the app:
//   - ISO  "2026-01-31"  — what <input type="date"> and the API use
//   - DMY  "31/01/2026"  — what staff read and type
//
// Everything below converts between the two safely: bad input returns an
// empty string rather than "Invalid Date".

const PLACEHOLDER = "—";

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Any date-ish value -> "31/01/2026" (or "—" when empty/invalid). */
export function fmtDate(value, fallback = PLACEHOLDER) {
  const d = toDate(value);
  if (!d) return fallback;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Any date-ish value -> "31/01/2026, 04:35 pm". */
export function fmtDateTime(value, fallback = PLACEHOLDER) {
  const d = toDate(value);
  if (!d) return fallback;
  const time = d
    .toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();
  return `${fmtDate(d)}, ${time}`;
}

/** Date -> "2026-01-31" for <input type="date">. Local time, not UTC. */
export function toISODate(value) {
  const d = toDate(value);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "2026-01-31" -> "31/01/2026". */
export function isoToDMY(iso) {
  if (!iso || typeof iso !== "string") return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

/**
 * "31/01/2026" -> "2026-01-31". Also accepts 31-01-2026 and 31.01.2026, and
 * a 2-digit year (26 -> 2026). Returns "" if it isn't a real calendar date,
 * so 31/02/2026 is rejected rather than rolling over into March.
 */
export function dmyToISO(text) {
  if (!text || typeof text !== "string") return "";
  const parts = text.trim().split(/[/\-.]/);
  if (parts.length !== 3) return "";

  let [d, m, y] = parts;
  if (!d || !m || !y) return "";
  if (y.length === 2) y = `20${y}`;
  if (y.length !== 4) return "";

  const day = parseInt(d, 10);
  const month = parseInt(m, 10);
  const year = parseInt(y, 10);
  if (!day || !month || !year) return "";
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";

  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return "";
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Today as "2026-01-31", in local time. */
export function todayISO() {
  return toISODate(new Date());
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Days between two dates with BOTH ends counted — how a ward bills a stay.
 *
 *   01/01/2026 -> 10/01/2026  =  10 days
 *   01/01/2026 -> 01/01/2026  =   1 day
 *
 * Leave `toISO` empty for a period that's still running: it counts up to
 * today. Never returns less than 1.
 */
export function inclusiveDays(fromISO, toISO) {
  if (!fromISO) return "";
  const start = toDate(fromISO);
  if (!start) return "";
  const end = toISO ? toDate(toISO) : new Date();
  if (!end) return "";

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  return Math.max(1, Math.floor((end - start) / MS_PER_DAY) + 1);
}

export const fmtINR = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;