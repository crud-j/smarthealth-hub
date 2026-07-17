"""
Immunization record endpoints.

  GET    /immunizations/{patient_id}      — all immunization records for patient
  POST   /immunizations/{patient_id}      — record a new vaccination
  PATCH  /immunizations/{patient_id}/{id} — update record (e.g., add lot number)
  DELETE /immunizations/{patient_id}/{id} — soft-delete (Physician/Admin only)

Full implementation: Phase 2 (Patient Records).
"""

from fastapi import APIRouter

router = APIRouter()

# TODO (Phase 2): Implement immunization CRUD with audit logging.
