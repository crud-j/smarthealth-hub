/**
 * Clinic hours: when appointments can be booked (Manila time, "HH:MM",
 * from openTime up to but not including closeTime).
 *
 * The backend is authoritative (GET /appointments/clinic-hours, and it
 * refuses bookings outside the hours); an Admin changes them on Settings.
 * This mirrors the check so staff see the problem before sending.
 */

export interface ClinicHours {
  openTime: string;
  closeTime: string;
}

/** Same defaults as the backend (system_settings_service). */
export const DEFAULT_CLINIC_HOURS: ClinicHours = { openTime: "07:00", closeTime: "17:00" };

/** "17:30" -> "5:30 PM" */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** A plain refusal if `time` ("HH:MM") is outside clinic hours, else null. */
export function outsideClinicHours(time: string, hours: ClinicHours): string | null {
  if (!time) return null;
  const hhmm = time.slice(0, 5); // "HH:MM:SS" -> "HH:MM"
  if (hhmm >= hours.openTime && hhmm < hours.closeTime) return null;
  return (
    `Appointments can only be booked during clinic hours, ` +
    `${formatClock(hours.openTime)} to ${formatClock(hours.closeTime)}. ` +
    `Pick a time in that range (check AM / PM).`
  );
}
