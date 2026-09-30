"""
Pydantic v2 schemas for the public intake application flow.

Routes:
  POST /intake-applications           — public self-registration (no JWT)
  GET  /intake-applications           — admin list (JWT, Admin only)
  GET  /intake-applications/{id}      — admin detail view (JWT, Admin only)
  POST /intake-applications/{id}/approve — admin approve (JWT, Admin only)
  POST /intake-applications/{id}/reject  — admin reject  (JWT, Admin only)
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas._base import BaseSchema

_PH_MOBILE_RE = re.compile(r"^(\+63|0)(9\d{9})$")


def _normalise_mobile(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip().replace(" ", "").replace("-", "")
    if not stripped:
        return None
    match = _PH_MOBILE_RE.match(stripped)
    if not match:
        raise ValueError(
            "Mobile number must be a valid Philippine mobile number "
            "(e.g. +639171234567 or 09171234567)."
        )
    return f"+63{match.group(2)}"


def _strip(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


# ---------------------------------------------------------------------------
# Public submission payload
# ---------------------------------------------------------------------------


class IntakeApplicationCreate(BaseSchema):
    """
    Public registration payload — no JWT required.

    Collected via the /register page and stored in intake_applications
    with status='pending' until an Admin reviews it.
    """

    # Personal Information
    first_name: str = Field(..., min_length=1, max_length=100)
    middle_name: str | None = Field(None, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    suffix: str | None = Field(None, max_length=20, description="Jr., Sr., III, etc.")
    birth_date: date = Field(..., description="Date of birth (past date required)")
    sex: Literal["male", "female", "other"] = Field(..., description="'male', 'female', or 'other'")
    civil_status: str | None = Field(None, max_length=20)
    philhealth_id: str | None = Field(None, max_length=20, description="PhilHealth ID number (optional)")
    pwd_id: str | None = Field(None, max_length=80, description="PWD ID number (optional)")
    blood_type: Literal[
        "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"
    ] | None = Field(None)

    # Contact & Address
    mobile_number: str | None = Field(None, max_length=20, description="Philippine mobile number")
    email: str | None = Field(None, max_length=254, description="Email address (optional)")
    house_street: str | None = Field(None, max_length=255, description="House No. / Street")
    barangay: str = Field(..., min_length=1, max_length=150)
    municipality: str = Field(..., min_length=1, max_length=150)
    province: str | None = Field(None, max_length=150)
    region: str | None = Field(None, max_length=150)
    zip_code: str | None = Field(None, max_length=10)

    # Emergency Contact
    emergency_contact_name: str = Field(..., min_length=1, max_length=150)
    emergency_contact_relationship: str | None = Field(None, max_length=80)
    emergency_contact_number: str = Field(..., max_length=20, description="Philippine mobile number")

    # Medical Background
    known_allergies: str | None = Field(None, max_length=2000)
    current_medications: str | None = Field(None, max_length=2000)
    pre_existing_conditions: str | None = Field(None, max_length=2000)

    # Visit purpose (from public intake form)
    visit_purpose: str | None = Field(None, max_length=200, description="Service the applicant is visiting for")
    visit_purpose_other: str | None = Field(None, max_length=500, description="Free-text purpose when 'Others' is selected")

    # Consent
    data_privacy_consent: bool = Field(..., description="Must be True to submit")

    @field_validator("birth_date")
    @classmethod
    def birth_date_must_be_past(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("Birth date cannot be in the future.")
        return v

    @field_validator("mobile_number", mode="before")
    @classmethod
    def validate_mobile(cls, v: str | None) -> str | None:
        return _normalise_mobile(v)

    @field_validator("emergency_contact_number", mode="before")
    @classmethod
    def validate_emergency_contact(cls, v: str) -> str:
        result = _normalise_mobile(v)
        if result is None:
            raise ValueError(
                "Emergency contact number must be a valid Philippine mobile number."
            )
        return result

    @field_validator(
        "first_name", "middle_name", "last_name", "suffix", "civil_status",
        "house_street", "barangay", "municipality", "province", "region",
        "zip_code", "emergency_contact_name", "emergency_contact_relationship",
        "philhealth_id", "pwd_id", "known_allergies", "current_medications",
        "pre_existing_conditions",
        mode="before",
    )
    @classmethod
    def strip_text(cls, v: str | None) -> str | None:
        return _strip(v)

    @field_validator("sex", mode="before")
    @classmethod
    def normalise_sex(cls, v: str) -> str:
        return v.lower().strip()

    @field_validator("blood_type", mode="before")
    @classmethod
    def coerce_empty_blood_type(cls, v: object) -> object:
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_validator("data_privacy_consent")
    @classmethod
    def consent_must_be_true(cls, v: bool) -> bool:
        if v is not True:
            raise ValueError("Data privacy consent is required to submit this application.")
        return v


# ---------------------------------------------------------------------------
# Admin review actions
# ---------------------------------------------------------------------------


class IntakeApplicationApprove(BaseSchema):
    """Body for POST /intake-applications/{id}/approve."""
    # No fields required — approval maps form_data to a Patient record.
    # Optionally override registration_source.
    registration_source: Literal["walk_in", "referral", "outreach", "others"] = Field(
        "walk_in",
        description="How the patient was registered (for the Patient record)",
    )


class IntakeApplicationReject(BaseSchema):
    """Body for POST /intake-applications/{id}/reject."""
    rejection_reason: str = Field(
        ..., min_length=5, max_length=1000,
        description="Reason for rejecting this application (required)"
    )


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class IntakeApplicationSummary(BaseSchema):
    """Lightweight row for the admin list page."""

    id: str
    reference_number: str
    status: str
    # Core identity fields extracted from form_data for quick display
    first_name: str
    last_name: str
    birth_date: date
    sex: str
    mobile_number: str | None
    barangay: str
    municipality: str
    created_at: datetime
    reviewed_at: datetime | None
    patient_id: str | None


class IntakeApplicationDetail(IntakeApplicationSummary):
    """Full application detail for the admin review view."""

    middle_name: str | None
    suffix: str | None
    civil_status: str | None
    philhealth_id: str | None
    pwd_id: str | None
    blood_type: str | None
    email: str | None
    house_street: str | None
    province: str | None
    region: str | None
    zip_code: str | None
    emergency_contact_name: str
    emergency_contact_relationship: str | None
    emergency_contact_number: str
    known_allergies: str | None
    current_medications: str | None
    pre_existing_conditions: str | None
    data_privacy_consent: bool
    rejection_reason: str | None
    reviewed_by_id: str | None
    submitted_ip: str | None


class IntakeApplicationPublicResponse(BaseSchema):
    """Returned to the applicant on successful submission."""

    reference_number: str
    status: str
    message: str = "Your application has been received. Please bring a valid ID when you visit the health center."


class PaginatedIntakeApplications(BaseSchema):
    """Paginated list of intake application summaries."""

    items: list[IntakeApplicationSummary]
    total: int
    page: int
    page_size: int


class IntakeApproveResponse(BaseSchema):
    """Returned after a successful approve action."""

    patient_id: str
    patient_code: str
    reference_number: str
    message: str = "Application approved. Patient record created."
