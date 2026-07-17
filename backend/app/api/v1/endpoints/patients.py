"""
Patient record endpoints.

  GET    /patients              — paginated search (name, patient_code, barangay)
  POST   /patients              — register new patient
  GET    /patients/{id}         — full patient record (demographics + summary)
  PATCH  /patients/{id}         — update demographics
  DELETE /patients/{id}         — soft-delete (Admin only)
  GET    /patients/{id}/visits  — visit history
  POST   /patients/{id}/visits  — record a new visit

All endpoints require JWT auth. PHI fields are decrypted only for
Physician/Nurse/Midwife and Admin roles; BHW sees redacted view.

Full implementation: Phase 2 (Patient Records).
"""

from fastapi import APIRouter

router = APIRouter()

# TODO (Phase 2): Implement patient CRUD with RBAC and audit logging.
