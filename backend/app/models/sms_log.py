"""
SMS dispatch log ORM model.

Columns (SDP Section 4 — sms_logs table):
  id, recipient_number (masked in logs), message_type, patient_id (FK, nullable),
  appointment_id (FK, nullable), semaphore_message_id, status,
  retry_count, sent_at, delivered_at, failed_reason, created_at

Full implementation: Phase 4 (Appointments & SMS).
"""

# TODO (Phase 4): Implement with delivery webhook update path.
