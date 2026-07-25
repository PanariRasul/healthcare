// server/src/lib/workingDays.js
//
// Single source of truth for "how many working days are in this month",
// shared by the Working Days calendar (holiday.controller.js) and Salary
// Management (salary.controller.js). A working day = any day that isn't a
// configured Holiday — Sunday is a normal working day like any other unless
// an admin explicitly marks that date as a holiday. Keeping this in one
// place means generating a salary row and viewing the calendar can never
// disagree on the count.
import prisma from "./prisma.js";

export function daysInMonth(year, month) {
  // month is 1-12; day 0 of the *next* JS month = last day of this month.
  return new Date(year, month, 0).getDate();
}

export function monthRange(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

// Returns { totalDays, sundays, holidays, workingDays } for a given
// year/month, based on the Holiday table configured in Working Days.
// `sundays` is informational only (how many Sundays fall in the month) —
// it is no longer subtracted from workingDays.
export async function getWorkingDaysSummary(year, month) {
  const total = daysInMonth(year, month);
  const { start, end } = monthRange(year, month);

  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: start, lte: end } },
  });

  let sundays = 0;
  for (let d = 1; d <= total; d++) {
    if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === 0) sundays += 1;
  }

  return {
    totalDays: total,
    sundays,
    holidays: holidays.length,
    workingDays: total - holidays.length,
  };
}