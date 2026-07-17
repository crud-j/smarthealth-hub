"""
Pydantic v2 schemas for Appointment request/response serialization.

Schemas to implement (Phase 4):
  - AppointmentCreate   — schedule payload (POST /appointments)
  - AppointmentUpdate   — reschedule / status update
  - AppointmentResponse — full appointment detail
  - AppointmentListItem — lightweight row for list view

Full implementation: Phase 4 (Appointments & SMS).
"""

# TODO (Phase 4): Implement with validator ensuring scheduled_at is in the future.
