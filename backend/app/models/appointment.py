"""
Appointment ORM model.

Columns (SDP Section 4 — appointments table):
  id, patient_id (FK), provider_id (FK → users), scheduled_at,
  purpose, status (scheduled|completed|no_show|cancelled),
  sms_reminder_task_id, notes, created_at, updated_at

Full implementation: Phase 4 (Appointments & SMS).
"""

# TODO (Phase 4): Implement with Celery task ID tracking for SMS revocation.
