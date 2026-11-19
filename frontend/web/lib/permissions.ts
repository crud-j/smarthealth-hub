/**
 * Who may do what with clinical data (admin role model B).
 *
 * These helpers only decide which buttons and fields the UI shows. The backend
 * enforces every rule with `require_role(...)`, so keep each helper in sync
 * with the backend guard named in its comment.
 *
 * Model B: the admin runs the system (users, audit log, settings, backups,
 * patient demographics) but never sees decrypted clinical notes and never
 * makes clinical edits. Only the physician role (Physician/Nurse/Midwife) does.
 */

type Role = string | null | undefined;

/**
 * Read decrypted diagnosis / treatment notes, edit a visit, add medical history.
 * Backend: `_PHI_READ = require_role("physician")` in `endpoints/medical_history.py`.
 */
export function canAccessClinicalPhi(role: Role): boolean {
  return role === "physician";
}

/**
 * Log a new visit (BHWs record vitals in the field).
 * Backend: `_CLINICAL = require_role("physician", "bhw")` in `endpoints/medical_history.py`.
 */
export function canLogVisit(role: Role): boolean {
  return role === "physician" || role === "bhw";
}

/**
 * Hard-delete an immunization record. Other staff correct entries via edit.
 * Backend: `_PHYSICIAN_ONLY = require_role("physician")` in `endpoints/immunizations.py`.
 */
export function canDeleteImmunization(role: Role): boolean {
  return role === "physician";
}
