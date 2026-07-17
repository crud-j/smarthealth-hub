"""
Clinical visit ORM model.

Columns (SDP Section 4 — visits table):
  id, patient_id (FK), appointment_id (FK, nullable), visit_date,
  chief_complaint, diagnosis (AES-256-GCM encrypted),
  treatment_notes (AES-256-GCM encrypted), vital_signs (JSONB),
  provider_id (FK → users), created_at, updated_at

SECURITY: `diagnosis` and `treatment_notes` are application-layer encrypted.

Full implementation: Phase 2 (Patient Records).
"""

# TODO (Phase 2): Implement with encrypted sensitive fields.
