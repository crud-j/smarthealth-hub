"""
Pydantic v2 schemas for Patient request/response serialization.

Schemas to implement (Phase 2):
  - PatientBase         — shared fields with validators
  - PatientCreate       — registration payload (POST /patients)
  - PatientUpdate       — partial update payload (PATCH /patients/{id})
  - PatientResponse     — full record response (authorized roles)
  - PatientSummary      — redacted view for BHW role (no sensitive fields)
  - PatientListItem     — lightweight row for search results
  - PaginatedPatients   — wrapper with total, page, items

Full implementation: Phase 2 (Patient Records).
"""

# TODO (Phase 2): Implement with Pydantic v2 field_validator for:
#   - birth_date must be in the past
#   - contact_number Philippine mobile format (+639XXXXXXXXX)
#   - patient_code auto-generated if not provided
