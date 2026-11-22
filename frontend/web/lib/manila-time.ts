/**
 * Appointment times are Manila times.
 *
 * Send them with the "+08:00" offset: a time without a timezone is read by
 * the server in its own timezone, and the production backend runs on UTC,
 * which saved bookings 8 hours late. (The backend now also treats a missing
 * timezone as Manila, but the frontend says so explicitly.)
 */

const MANILA_OFFSET = "+08:00"; // the Philippines has no daylight saving time

/** "2026-11-22" + "21:00" -> "2026-11-22T21:00:00+08:00" */
export function manilaIso(date: string, time: string): string {
  const hhmmss = time.length === 5 ? `${time}:00` : time;
  return `${date}T${hhmmss}${MANILA_OFFSET}`;
}

/** Today's date in Manila as "YYYY-MM-DD" (for date pickers). */
export function manilaToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now);
}
