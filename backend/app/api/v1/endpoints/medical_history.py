"""
Medical history endpoints.

  GET    /medical-history/{patient_id}        — patient's medical history entries
  POST   /medical-history/{patient_id}        — add new medical history entry
  PATCH  /medical-history/{patient_id}/{id}   — update entry
  DELETE /medical-history/{patient_id}/{id}   — soft-delete (Physician/Admin only)

Sensitive fields (notes, diagnoses) are AES-256-GCM encrypted at rest.

Full implementation: Phase 2 (Patient Records).
"""

from fastapi import APIRouter

router = APIRouter()

# TODO (Phase 2): Implement with application-layer encryption + audit logging.
