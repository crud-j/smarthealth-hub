"""
Medical history ORM model.

Columns (SDP Section 4 — medical_history table):
  id, patient_id (FK), condition, notes (AES-256-GCM encrypted),
  diagnosed_at, is_active, created_at, updated_at, recorded_by_id

SECURITY: `notes` column stores ciphertext; decrypt only in service layer
for authorized roles (Physician / Admin).

Full implementation: Phase 2 (Patient Records).
"""

# TODO (Phase 2): Implement with encrypted `notes` field.
