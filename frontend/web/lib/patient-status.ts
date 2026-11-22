/**
 * Is a patient in daily work, or switched off / stored away?
 *
 * Deactivated (`isActive === false`) and archived patients take no new
 * visits, immunizations, medical history entries or bookings until an Admin
 * switches them back on. Their old records stay readable.
 *
 * Mirrors `patient_service.not_in_use_reason` on the backend, which is the
 * authoritative check (it answers 409 with the same text).
 */

export const INACTIVE_PATIENT_MESSAGE =
  "The patient is inactive. Reactivate them on the Inactive Patients page first.";
export const ARCHIVED_PATIENT_MESSAGE =
  "The patient is archived. Restore them from the Patient Archive first.";

export interface PatientUseStatus {
  isActive: boolean;
  archivedAt?: string | null;
}

/** Why the patient can't get new records right now, or `null` if they can. */
export function patientNotInUseReason(patient: PatientUseStatus): string | null {
  if (!patient.isActive) return INACTIVE_PATIENT_MESSAGE;
  if (patient.archivedAt) return ARCHIVED_PATIENT_MESSAGE;
  return null;
}
