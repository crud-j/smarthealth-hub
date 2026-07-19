"""
Pydantic v2 schemas for Appointment request/response serialization.

Schemas:
  AppointmentCreate   — POST /appointments payload.
  AppointmentUpdate   — PUT /appointments/{id} payload (all fields optional).
  AppointmentResponse — Full appointment detail with denormalized patient fields.
  PaginatedAppointments — Paginated wrapper for list responses.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import field_validator

from app.schemas._base import BaseSchema

# Valid appointment status values matching the DB CHECK constraint.
_VALID_STATUSES = frozenset({"pending", "confirmed", "completed", "missed", "cancelled"})

# Valid appointment_type examples (not enforced at schema level — validated
# at service level so new types can be added without a code change).
APPOINTMENT_TYPES = frozenset({
    "consultation",
    "immunization",
    "prenatal",
    "follow_up",
    "general_checkup",
    "dental",
    "family_planning",
    "postnatal",
})


class AppointmentCreate(BaseSchema):
    """
    Payload for scheduling a new appointment.

    ``scheduled_at`` must be a future timestamp (validated by the service
    layer so the error message is user-friendly).
    """

    patient_id: uuid.UUID
    appointment_type: str
    scheduled_at: datetime
    notes: str | None = None

    @field_validator("appointment_type")
    @classmethod
    def appointment_type_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("appointment_type must not be blank")
        return v.lower().strip()


class AppointmentUpdate(BaseSchema):
    """
    Partial-update payload for PUT /appointments/{id}.

    All fields are optional; only provided fields are updated.
    """

    appointment_type: str | None = None
    scheduled_at: datetime | None = None
    # Allowed status values mirror the DB CHECK constraint.
    status: str | None = None
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_STATUSES:
            raise ValueError(
                f"Invalid status '{v}'. Must be one of: "
                + ", ".join(sorted(_VALID_STATUSES))
            )
        return v

    @field_validator("appointment_type")
    @classmethod
    def appointment_type_not_empty(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("appointment_type must not be blank")
        return v.lower().strip() if v else v


class AppointmentResponse(BaseSchema):
    """
    Full appointment detail, including denormalized patient fields from a JOIN.

    ``full_name`` is assembled by the service layer as "First [Middle] Last".
    ``updated_at`` reflects the last time any appointment column changed;
    since the Appointment model only has ``created_at``, the service layer
    returns ``created_at`` as ``updated_at`` when no separate column exists.
    """

    id: uuid.UUID
    patient_id: uuid.UUID
    patient_code: str
    full_name: str
    appointment_type: str
    scheduled_at: datetime
    status: str
    notes: str | None
    created_at: datetime
    # updated_at is constructed by the service layer (falls back to created_at
    # since the Appointment model currently only tracks created_at).
    updated_at: datetime


class PaginatedAppointments(BaseSchema):
    """Paginated list response for GET /appointments."""

    items: list[AppointmentResponse]
    total: int
    page: int
    page_size: int
