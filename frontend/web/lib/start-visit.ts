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
 * (Physician, BHW), the appointment is on today's Manila date, no visit
 * has completed it yet (not completed / cancelled), and the patient still
 * takes new visits (not deactivated or archived).
 */
export function canStartVisit(
  role: string | null | undefined,
  appointment: { status: string; scheduledAt: string; patientNotInUseReason?: string | null },
  today: string = manilaToday(),
): boolean {
  return (
    canLogVisit(role) &&
    !appointment.patientNotInUseReason &&
    OPEN_STATUSES.includes(appointment.status) &&
    manilaDate(appointment.scheduledAt) === today
  );
}

/**
 * Why a today's appointment has no "Start visit" although it otherwise
 * would (the patient was deactivated or archived), or null. Lets the page
 * say so instead of leaving staff guessing.
 */
export function startVisitBlockedReason(
  role: string | null | undefined,
  appointment: { status: string; scheduledAt: string; patientNotInUseReason?: string | null },
  today: string = manilaToday(),
): string | null {
  if (!appointment.patientNotInUseReason) return null;
  const otherwise = canStartVisit(role, { ...appointment, patientNotInUseReason: null }, today);
  return otherwise ? appointment.patientNotInUseReason : null;
}

/** Add Visit for the patient. */
export function startVisitHref(patientId: string): string {
  return `/patients/${patientId}/visits/new`;
}
