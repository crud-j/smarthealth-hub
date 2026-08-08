"""
Pydantic v2 schemas for Immunization request/response serialization.

All schemas use ``model_config = ConfigDict(from_attributes=True)`` (via
``BaseSchema``) so they can be built directly from SQLAlchemy ORM instances.

Schemas
-------
ImmunizationCreate       POST /patients/{id}/immunizations
ImmunizationUpdate       PATCH /patients/{id}/immunizations/{id}  (all optional)
ImmunizationResponse     Full record returned to callers
ImmunizationListResponse Paginated list wrapper

Status lifecycle: scheduled → completed | missed | cancelled
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator

from app.schemas._base import BaseSchema

# Valid status values matching the DB CHECK constraint.
_VALID_STATUSES = ("scheduled", "completed", "missed", "cancelled")

ImmunizationStatus = Literal["scheduled", "completed", "missed", "cancelled"]


# ---------------------------------------------------------------------------
# ImmunizationCreate — POST /patients/{patient_id}/immunizations
# ---------------------------------------------------------------------------


class ImmunizationCreate(BaseSchema):
    """
    Payload for recording a new immunization dose.

    ``vaccine_name`` and ``dose_number`` are required.  All other fields are
    optional to allow partial data entry at the time of administration (e.g.
    batch_number may be recorded later).
    """

    vaccine_name: str = Field(..., min_length=1, max_length=100)
    dose_number: int = Field(1, ge=1, description="Dose sequence number (1-based)")
    date_administered: date | None = Field(
        None, description="Date the dose was given; None means not yet administered"
    )
    administered_by: uuid.UUID | None = Field(
        None, description="User ID of the staff member who administered the dose"
    )
    batch_number: str | None = Field(None, max_length=50, description="Vaccine lot/batch number")
    next_due_date: date | None = Field(
        None, description="Date the next dose or booster is due"
    )
    notes: str | None = Field(None, description="Free-text clinical notes")
    status: ImmunizationStatus = Field(
        "scheduled",
        description="Lifecycle status: scheduled | completed | missed | cancelled",
    )

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in _VALID_STATUSES:
            raise ValueError(
                f"status must be one of: {', '.join(_VALID_STATUSES)}"
            )
        return v


# ---------------------------------------------------------------------------
# ImmunizationUpdate — PATCH /patients/{id}/immunizations/{id}
# ---------------------------------------------------------------------------


class ImmunizationUpdate(BaseSchema):
    """
    Partial update payload for an existing immunization record.

    All fields are optional — only supplied (non-None) fields are updated.
    Commonly used to mark a dose as 'completed', update batch_number after
    administration, or correct the next_due_date.
    """

    vaccine_name: str | None = Field(None, min_length=1, max_length=100)
    dose_number: int | None = Field(None, ge=1)
    date_administered: date | None = Field(None)
    administered_by: uuid.UUID | None = Field(None)
    batch_number: str | None = Field(None, max_length=50)
    next_due_date: date | None = Field(None)
    notes: str | None = Field(None)
    status: ImmunizationStatus | None = Field(None)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_STATUSES:
            raise ValueError(
                f"status must be one of: {', '.join(_VALID_STATUSES)}"
            )
        return v


# ---------------------------------------------------------------------------
# ImmunizationResponse — full record
# ---------------------------------------------------------------------------


class ImmunizationResponse(BaseSchema):
    """Full immunization record returned to authorized callers."""

    id: str
    patient_id: str
    vaccine_name: str
    dose_number: int
    date_administered: date | None
    administered_by: str | None
    batch_number: str | None
    next_due_date: date | None
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# ImmunizationListResponse — paginated wrapper
# ---------------------------------------------------------------------------


class ImmunizationListResponse(BaseSchema):
    """Paginated list of immunization records for a patient."""

    items: list[ImmunizationResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# ImmunizationWithPatientResponse — cross-patient list item (includes name)
# ---------------------------------------------------------------------------


class ImmunizationWithPatientResponse(ImmunizationResponse):
    """Immunization record extended with the patient's full name."""

    patient_name: str


# ---------------------------------------------------------------------------
# PaginatedImmunizationsWithPatient — cross-patient paginated wrapper
# ---------------------------------------------------------------------------


class PaginatedImmunizationsWithPatient(BaseSchema):
    """Paginated cross-patient immunization list."""

    items: list[ImmunizationWithPatientResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# ImmunizationDueSummary — due-count dashboard widget
# ---------------------------------------------------------------------------


class ImmunizationDueSummary(BaseSchema):
    """Summary counts of immunizations due soon."""

    due_this_week: int
    due_this_month: int
