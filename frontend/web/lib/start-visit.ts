/**
 * "Start visit": open Add Visit for a patient straight from today's
 * appointment. Add Visit then fills in the visit type and chief complaint
 * from that appointment and its intake form (GET /patients/{id}/visits/prefill).
 */

import { manilaToday } from "./manila-time";
import { canLogVisit } from "./permissions";

/**
 * Appointments a logged visit completes.
 * Backend: `appointment_service.VISIT_COMPLETES_STATUSES` (also what the prefill reads).
 */
const OPEN_STATUSES: readonly string[] = ["pending", "confirmed", "missed"];

/** The Manila calendar date ("YYYY-MM-DD") of an ISO timestamp. */
export function manilaDate(iso: string): string {
  return manilaToday(new Date(iso));
}

/**
 * Show "Start visit" for this appointment: the user may log visits
 * (Physician, BHW), the appointment is on today's Manila date, and no visit
 * has completed it yet (not completed / cancelled).
 */
export function canStartVisit(
  role: string | null | undefined,
  appointment: { status: string; scheduledAt: string },
  today: string = manilaToday(),
): boolean {
  return (
    canLogVisit(role) &&
    OPEN_STATUSES.includes(appointment.status) &&
    manilaDate(appointment.scheduledAt) === today
  );
}

/** Add Visit for the patient. */
export function startVisitHref(patientId: string): string {
  return `/patients/${patientId}/visits/new`;
}
