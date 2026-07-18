"""
Pydantic v2 schemas for Patient request/response serialization.

All schemas use ``model_config = ConfigDict(from_attributes=True)`` so they
can be built directly from SQLAlchemy ORM instances via ``model_validate()``.

No ``.dict()`` calls — use ``.model_dump()`` per Pydantic v2 conventions.

Schemas
-------
PatientCreate          POST /patients — registration payload
PatientUpdate          PUT  /patients/{id} — partial-update payload (all optional)
PatientResponse        Full patient object returned to authorized callers
PatientSummary         Lightweight row for list/search results
PatientVerifySummary   Returned by GET /patients/{id}/verify (card-scan flow)

Field validators
----------------
- birth_date must be in the past
- mobile_number: Philippine mobile format (+639XXXXXXXXX or 09XXXXXXXXX — normalised to +63)
- philhealth_member_type: 'member' or 'dependent' only
- sex: 'male' or 'female' only (lowercase normalised)
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas._base import BaseSchema

# ---------------------------------------------------------------------------
# Shared field validators (used via @field_validator on concrete classes)
# ---------------------------------------------------------------------------

_PH_MOBILE_RE = re.compile(r"^(\+63|0)(9\d{9})$")


def _normalise_mobile(value: str | None) -> str | None:
    """Normalize PH mobile number to +63xxxxxxxxxx form."""
    if value is None:
        return None
    stripped = value.strip().replace(" ", "").replace("-", "")
    match = _PH_MOBILE_RE.match(stripped)
    if not match:
        raise ValueError(
            "Mobile number must be a valid Philippine mobile number "
            "(e.g. +639171234567 or 09171234567)."
        )
    return f"+63{match.group(2)}"


# ---------------------------------------------------------------------------
# PatientCreate — POST /patients
# ---------------------------------------------------------------------------


class PatientCreate(BaseSchema):
    """
    Registration payload for a new patient.

    Required fields match the RHU Patient Record form header.
    Optional fields capture additional system data captured at registration.
    """

    # Core demographics (RHU form)
    first_name: str = Field(..., min_length=1, max_length=100)
    middle_name: str | None = Field(None, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    birth_date: date = Field(..., description="Patient's date of birth (past date)")
    sex: Literal["male", "female"] = Field(..., description="'male' or 'female'")
    civil_status: str | None = Field(None, max_length=20)

    # Contact (RHU form "CONTACT NO." and "COMPLETE ADDRESS")
    mobile_number: str | None = Field(
        None,
        max_length=20,
        description="Philippine mobile number (+639XXXXXXXXX or 09XXXXXXXXX)",
    )
    address: str = Field(..., min_length=1, description="Complete residential address")

    # Guardian info (for minors, seniors, PWD)
    guardian_name: str | None = Field(None, max_length=150)
    guardian_contact: str | None = Field(None, max_length=20)

    # PhilHealth (RHU form "PHILHEALTH MEMBER / DEPENDENTS")
    philhealth_no: str | None = Field(None, max_length=20)
    philhealth_member_type: Literal["member", "dependent"] | None = Field(
        None,
        description="'member' if the patient is the primary PhilHealth member, "
        "'dependent' if covered under a family member",
    )

    # Vulnerability flags
    is_pwd: bool = Field(False, description="Person with Disability")
    is_pregnant: bool = Field(False, description="Currently pregnant")
    # is_senior is auto-computed from birth_date; if supplied it is overridden

    @field_validator("birth_date")
    @classmethod
    def birth_date_must_be_past(cls, v: date) -> date:
        if v >= date.today():
            raise ValueError("Birth date must be in the past.")
        return v

    @field_validator("mobile_number", mode="before")
    @classmethod
    def validate_mobile(cls, v: str | None) -> str | None:
        return _normalise_mobile(v)

    @field_validator("guardian_contact", mode="before")
    @classmethod
    def validate_guardian_contact(cls, v: str | None) -> str | None:
        return _normalise_mobile(v)

    @field_validator("sex", mode="before")
    @classmethod
    def normalise_sex(cls, v: str) -> str:
        return v.lower().strip()


# ---------------------------------------------------------------------------
# PatientUpdate — PUT /patients/{id}  (PATCH-style — all fields optional)
# ---------------------------------------------------------------------------


class PatientUpdate(BaseSchema):
    """
    Partial update payload for PUT /patients/{id}.

    All fields are optional; only supplied fields are updated.
    ``birth_date`` and ``sex`` may be corrected by authorized staff.
    ``is_senior`` is re-computed server-side when ``birth_date`` changes.
    """

    first_name: str | None = Field(None, min_length=1, max_length=100)
    middle_name: str | None = Field(None, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    birth_date: date | None = Field(None)
    sex: Literal["male", "female"] | None = Field(None)
    civil_status: str | None = Field(None, max_length=20)
    mobile_number: str | None = Field(None, max_length=20)
    address: str | None = Field(None, min_length=1)
    guardian_name: str | None = Field(None, max_length=150)
    guardian_contact: str | None = Field(None, max_length=20)
    philhealth_no: str | None = Field(None, max_length=20)
    philhealth_member_type: Literal["member", "dependent"] | None = Field(None)
    is_pwd: bool | None = Field(None)
    is_pregnant: bool | None = Field(None)

    @field_validator("birth_date")
    @classmethod
    def birth_date_must_be_past(cls, v: date | None) -> date | None:
        if v is not None and v >= date.today():
            raise ValueError("Birth date must be in the past.")
        return v

    @field_validator("mobile_number", mode="before")
    @classmethod
    def validate_mobile(cls, v: str | None) -> str | None:
        return _normalise_mobile(v)

    @field_validator("guardian_contact", mode="before")
    @classmethod
    def validate_guardian_contact(cls, v: str | None) -> str | None:
        return _normalise_mobile(v)

    @field_validator("sex", mode="before")
    @classmethod
    def normalise_sex(cls, v: str | None) -> str | None:
        return v.lower().strip() if v else None


# ---------------------------------------------------------------------------
# PatientResponse — full patient object (GET /patients/{id})
# ---------------------------------------------------------------------------


class PatientResponse(BaseSchema):
    """
    Full patient record returned to authorized callers.

    ``age`` is computed at serialization time from ``birth_date``.
    ``is_senior`` is the persisted flag (auto-set on registration when age ≥ 60).
    """

    id: str  # UUID serialized as string for JSON transport
    patient_code: str
    first_name: str
    middle_name: str | None
    last_name: str
    birth_date: date
    sex: str
    civil_status: str | None
    mobile_number: str | None
    address: str
    guardian_name: str | None
    guardian_contact: str | None
    philhealth_no: str | None
    philhealth_member_type: str | None
    is_pwd: bool
    is_senior: bool
    is_pregnant: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Computed fields
    age: int = Field(default=0, description="Age in years, computed from birth_date")
    full_name: str = Field(default="", description="First Middle Last")

    @model_validator(mode="after")
    def compute_derived_fields(self) -> "PatientResponse":
        today = date.today()
        bd = self.birth_date
        years = (
            today.year
            - bd.year
            - ((today.month, today.day) < (bd.month, bd.day))
        )
        self.age = max(0, years)
        parts = [self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        parts.append(self.last_name)
        self.full_name = " ".join(parts)
        return self


# ---------------------------------------------------------------------------
# PatientSummary — lightweight row for list/search
# ---------------------------------------------------------------------------


class PatientSummary(BaseSchema):
    """
    Lightweight patient row for paginated list/search results.

    PHI is minimized: no address, no guardian info, no PhilHealth number.
    Safe to return to all authenticated staff roles.
    """

    id: str
    patient_code: str
    first_name: str
    middle_name: str | None
    last_name: str
    birth_date: date
    sex: str
    mobile_number: str | None
    is_senior: bool
    is_pwd: bool
    is_pregnant: bool
    is_active: bool

    # Computed at response time
    age: int = Field(default=0)
    full_name: str = Field(default="")

    @model_validator(mode="after")
    def compute_derived_fields(self) -> "PatientSummary":
        today = date.today()
        bd = self.birth_date
        years = (
            today.year
            - bd.year
            - ((today.month, today.day) < (bd.month, bd.day))
        )
        self.age = max(0, years)
        parts = [self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        parts.append(self.last_name)
        self.full_name = " ".join(parts)
        return self


# ---------------------------------------------------------------------------
# PaginatedPatients — wrapper for list endpoint
# ---------------------------------------------------------------------------


class PaginatedPatients(BaseSchema):
    """Paginated list of patient summaries."""

    items: list[PatientSummary]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# PatientVerifySummary — returned by GET /patients/{id}/verify
# ---------------------------------------------------------------------------


class PatientVerifySummary(BaseSchema):
    """
    Minimal patient summary returned by the card-verify endpoint.

    Used by the front-desk verification screen after a BHW scans/taps a card.
    Contains only the minimum fields needed to confirm identity and display
    priority flags — no address, no guardian, no PhilHealth details.
    """

    id: str
    patient_code: str
    full_name: str
    age: int
    sex: str
    is_senior: bool
    is_pwd: bool
    is_pregnant: bool
    last_visit_date: datetime | None = Field(
        None, description="Timestamp of the most recent visit record"
    )
    card_status: str | None = Field(
        None,
        description="Status of the patient's health card: 'active', 'lost', 'reissued', or None if no card issued yet",
    )
