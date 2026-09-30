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
    """Normalize PH mobile number to +63xxxxxxxxxx form.

    Empty strings are coerced to None (the field is optional — an empty
    string from a form input means "not provided", not an invalid number).
    """
    if value is None:
        return None
    stripped = value.strip().replace(" ", "").replace("-", "")
    # Treat empty / whitespace-only strings as absent (not provided)
    if not stripped:
        return None
    match = _PH_MOBILE_RE.match(stripped)
    if not match:
        raise ValueError(
            "Mobile number must be a valid Philippine mobile number "
            "(e.g. +639171234567 or 09171234567)."
        )
    return f"+63{match.group(2)}"


def _strip_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


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
    household_number: str | None = Field(None, max_length=50)
    sitio_purok: str | None = Field(None, max_length=150)
    barangay: str | None = Field(None, max_length=150)
    municipality: str | None = Field(None, max_length=150)
    province: str | None = Field(None, max_length=150)
    occupation: str | None = Field(None, max_length=150)

    # Contact (RHU form "CONTACT NO." and "COMPLETE ADDRESS")
    mobile_number: str | None = Field(
        None,
        max_length=20,
        description="Philippine mobile number (+639XXXXXXXXX or 09XXXXXXXXX)",
    )
    address: str | None = Field(None, max_length=500, description="Complete residential address")

    # Guardian info (for minors, seniors, PWD)
    guardian_name: str | None = Field(None, max_length=150)
    guardian_contact: str | None = Field(None, max_length=20)
    emergency_contact_name: str | None = Field(
        None,
        min_length=1,
        max_length=150,
        description="Primary emergency contact name (optional for legacy/partial records)",
    )
    emergency_contact_number: str | None = Field(
        None,
        max_length=20,
        description="Primary emergency contact number (Philippine mobile)",
    )

    # PhilHealth (RHU form "PHILHEALTH MEMBER / DEPENDENTS")
    philhealth_no: str | None = Field(None, max_length=20)
    philhealth_member_type: Literal["member", "dependent"] | None = Field(
        None,
        description="'member' if the patient is the primary PhilHealth member, "
        "'dependent' if covered under a family member",
    )
    philhealth_category: Literal[
        "indigent",
        "sponsored",
        "formal_economy",
        "informal_economy",
        "lifetime_member",
    ] | None = Field(None, description="Expanded PhilHealth category")
    is_4ps_beneficiary: bool = Field(False, description="4Ps beneficiary flag")
    household_id_4ps: str | None = Field(None, max_length=80)
    is_indigenous: bool = Field(False, description="Indigenous Peoples flag")
    place_of_birth: str | None = Field(None, max_length=150)
    mothers_maiden_name: str | None = Field(None, max_length=150)

    # Vulnerability flags
    is_pwd: bool = Field(False, description="Person with Disability")
    is_pregnant: bool = Field(False, description="Currently pregnant")
    # is_senior is auto-computed from birth_date; if supplied it is overridden
    senior_id_number: str | None = Field(None, max_length=80)
    pwd_id_number: str | None = Field(None, max_length=80)
    last_menstrual_period: date | None = Field(None)
    gravida: int | None = Field(None, ge=0)
    para: int | None = Field(None, ge=0)
    estimated_due_date: date | None = Field(None)
    height_cm: float | None = Field(None, ge=30.0, le=250.0)
    weight_kg: float | None = Field(None, ge=0.5, le=500.0)
    allergies: str | None = Field(None, max_length=5000)
    known_conditions: str | None = Field(None, max_length=5000)
    registration_source: Literal["walk_in", "referral", "outreach", "others"] | None = Field(
        "walk_in",
        description="How the patient was registered",
    )
    data_privacy_consent: bool = Field(
        True,
        description="Must be true to submit; defaults to true for legacy client payloads.",
    )

    # ABO/Rh blood group — optional at registration; can be updated later.
    blood_type: Literal[
        "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"
    ] | None = Field(None, description="Patient's ABO/Rh blood group, or None if unknown")

    # Duplicate-patient override (L-2). When a prior POST /patients call
    # returned duplicate_warning=true, the caller may resubmit the identical
    # payload with confirm_duplicate=True to bypass the warning and register
    # anyway. Intended to be gated to the Admin role on the frontend — the
    # backend does not itself restrict which authenticated role may set this
    # flag, since BHW/physician/admin_staff can all already create patients.
    confirm_duplicate: bool = Field(
        False,
        description=(
            "Set to True to bypass the duplicate-patient warning returned by "
            "a prior POST /patients call and register the patient anyway. "
            "The frontend restricts this override to the Admin role."
        ),
    )

    # Data-entry source tracking — set by the frontend based on how the
    # registration was initiated. 'manual' is the default for all existing
    # and new registrations that do not use OCR or pre-visit intake.
    registration_data_source: Literal["manual", "ocr", "pre_visit"] = Field(
        "manual",
        description="Data-entry source: 'manual' (typed), 'ocr' (ID scan), 'pre_visit' (patient self-entry link).",
    )

    # Preferred language for SMS reminders ('en' = English, 'fil' = Filipino).
    preferred_language: Literal["en", "fil"] = Field(
        "en",
        description="Preferred language for SMS reminders: 'en' (English) or 'fil' (Filipino).",
    )

    @field_validator("birth_date")
    @classmethod
    def birth_date_must_be_past(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("Birth date cannot be in the future.")
        return v

    @field_validator(
        "first_name",
        "middle_name",
        "last_name",
        "civil_status",
        "household_number",
        "sitio_purok",
        "barangay",
        "municipality",
        "province",
        "occupation",
        "address",
        "guardian_name",
        "emergency_contact_name",
        "philhealth_no",
        "philhealth_category",
        "household_id_4ps",
        "place_of_birth",
        "mothers_maiden_name",
        "senior_id_number",
        "pwd_id_number",
        "allergies",
        "known_conditions",
        "registration_source",
        mode="before",
    )
    @classmethod
    def strip_optional_text(cls, v: str | None) -> str | None:
        return _strip_text(v)

    @field_validator("mobile_number", mode="before")
    @classmethod
    def validate_mobile(cls, v: str | None) -> str | None:
        return _normalise_mobile(v)

    @field_validator("guardian_contact", mode="before")
    @classmethod
    def validate_guardian_contact(cls, v: str | None) -> str | None:
        return _normalise_mobile(v)

    @field_validator("emergency_contact_number", mode="before")
    @classmethod
    def validate_emergency_contact(cls, v: str | None) -> str | None:
        return _normalise_mobile(v)

    @field_validator("sex", mode="before")
    @classmethod
    def normalise_sex(cls, v: str) -> str:
        return v.lower().strip()

    @field_validator("blood_type", mode="before")
    @classmethod
    def coerce_empty_blood_type(cls, v: object) -> object:
        """Coerce empty-string blood_type to None.

        HTML <select> elements emit an empty string when the placeholder
        option ("— Unknown —", value="") is selected.  The Literal validator
        on blood_type does not accept "", so we normalise it here to None
        (meaning "not recorded") before the Literal check runs.
        """
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_validator("data_privacy_consent")
    @classmethod
    def consent_must_be_true(cls, v: bool) -> bool:
        if v is not True:
            raise ValueError("Data privacy consent is required.")
        return v


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
    household_number: str | None = Field(None, max_length=50)
    sitio_purok: str | None = Field(None, max_length=150)
    barangay: str | None = Field(None, max_length=150)
    municipality: str | None = Field(None, max_length=150)
    province: str | None = Field(None, max_length=150)
    occupation: str | None = Field(None, max_length=150)
    mobile_number: str | None = Field(None, max_length=20)
    address: str | None = Field(None, max_length=500)
    guardian_name: str | None = Field(None, max_length=150)
    guardian_contact: str | None = Field(None, max_length=20)
    emergency_contact_name: str | None = Field(None, max_length=150)
    emergency_contact_number: str | None = Field(None, max_length=20)
    philhealth_no: str | None = Field(None, max_length=20)
    philhealth_member_type: Literal["member", "dependent"] | None = Field(None)
    philhealth_category: Literal[
        "indigent",
        "sponsored",
        "formal_economy",
        "informal_economy",
        "lifetime_member",
    ] | None = Field(None)
    is_4ps_beneficiary: bool | None = Field(None)
    household_id_4ps: str | None = Field(None, max_length=80)
    is_indigenous: bool | None = Field(None)
    place_of_birth: str | None = Field(None, max_length=150)
    mothers_maiden_name: str | None = Field(None, max_length=150)
    is_pwd: bool | None = Field(None)
    is_pregnant: bool | None = Field(None)
    senior_id_number: str | None = Field(None, max_length=80)
    pwd_id_number: str | None = Field(None, max_length=80)
    last_menstrual_period: date | None = Field(None)
    gravida: int | None = Field(None, ge=0)
    para: int | None = Field(None, ge=0)
    estimated_due_date: date | None = Field(None)
    height_cm: float | None = Field(None, ge=30.0, le=250.0)
    weight_kg: float | None = Field(None, ge=0.5, le=500.0)
    allergies: str | None = Field(None, max_length=5000)
    known_conditions: str | None = Field(None, max_length=5000)
    registration_source: Literal["walk_in", "referral", "outreach", "others"] | None = Field(None)
    data_privacy_consent: bool | None = Field(None)
    blood_type: Literal[
        "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"
    ] | None = Field(None, description="Patient's ABO/Rh blood group, or None if unknown")

    # Preferred language for SMS reminders ('en' = English, 'fil' = Filipino).
    preferred_language: Literal["en", "fil"] | None = Field(
        None,
        description="Preferred language for SMS reminders: 'en' (English) or 'fil' (Filipino).",
    )

    @field_validator("birth_date")
    @classmethod
    def birth_date_must_be_past(cls, v: date | None) -> date | None:
        if v is not None and v > date.today():
            raise ValueError("Birth date cannot be in the future.")
        return v

    @field_validator(
        "first_name",
        "middle_name",
        "last_name",
        "civil_status",
        "household_number",
        "sitio_purok",
        "barangay",
        "municipality",
        "province",
        "occupation",
        "address",
        "guardian_name",
        "emergency_contact_name",
        "philhealth_no",
        "philhealth_category",
        "household_id_4ps",
        "place_of_birth",
        "mothers_maiden_name",
        "senior_id_number",
        "pwd_id_number",
        "allergies",
        "known_conditions",
        "registration_source",
        mode="before",
    )
    @classmethod
    def strip_optional_text(cls, v: str | None) -> str | None:
        return _strip_text(v)

    @field_validator("mobile_number", mode="before")
    @classmethod
    def validate_mobile(cls, v: str | None) -> str | None:
        return _normalise_mobile(v)

    @field_validator("guardian_contact", mode="before")
    @classmethod
    def validate_guardian_contact(cls, v: str | None) -> str | None:
        return _normalise_mobile(v)

    @field_validator("emergency_contact_number", mode="before")
    @classmethod
    def validate_emergency_contact(cls, v: str | None) -> str | None:
        return _normalise_mobile(v)

    @field_validator("sex", mode="before")
    @classmethod
    def normalise_sex(cls, v: str | None) -> str | None:
        return v.lower().strip() if v else None

    @field_validator("blood_type", mode="before")
    @classmethod
    def coerce_empty_blood_type(cls, v: object) -> object:
        """Coerce empty-string blood_type to None (same rationale as PatientCreate)."""
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_validator("data_privacy_consent")
    @classmethod
    def consent_if_present_must_be_true(cls, v: bool | None) -> bool | None:
        if v is False:
            raise ValueError("Data privacy consent cannot be turned off.")
        return v


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
    household_number: str | None
    sitio_purok: str | None
    barangay: str | None
    municipality: str | None
    province: str | None
    occupation: str | None
    mobile_number: str | None
    address: str
    guardian_name: str | None
    guardian_contact: str | None
    emergency_contact_name: str | None
    emergency_contact_number: str | None
    philhealth_no: str | None
    philhealth_member_type: str | None
    philhealth_category: str | None = None
    is_4ps_beneficiary: bool
    household_id_4ps: str | None
    is_indigenous: bool
    place_of_birth: str | None
    mothers_maiden_name: str | None
    is_pwd: bool
    is_senior: bool
    is_pregnant: bool
    senior_id_number: str | None
    pwd_id_number: str | None
    last_menstrual_period: date | None
    gravida: int | None
    para: int | None
    estimated_due_date: date | None
    height_cm: float | None
    weight_kg: float | None
    allergies: str | None
    known_conditions: str | None
    registration_source: str | None
    registration_data_source: str = "manual"
    data_privacy_consent: bool
    data_privacy_consent_at: datetime | None
    is_active: bool
    blood_type: str | None = None
    # Archive fields — None when the patient is not archived
    archived_at: datetime | None = None
    archived_by: str | None = None
    archive_reason: str | None = None
    created_at: datetime
    updated_at: datetime

    # Profile photo — root-relative URL path to the stored photo JPEG,
    # e.g. "/media/patient_photos/<uuid>.jpg".  None means no photo uploaded.
    # The frontend should resolve this against the API host base URL.
    photo_path: str | None = Field(
        None,
        description=(
            "Root-relative URL path to the patient's profile photo JPEG, "
            "e.g. '/media/patient_photos/<uuid>.jpg'. "
            "None if no photo has been uploaded yet."
        ),
    )

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
    blood_type: str | None = None
    # Included so the dashboard "Recently Registered Patients" panel can sort
    # / display registration recency without a second round-trip.
    created_at: datetime | None = None

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


class PatientDuplicateMatch(BaseSchema):
    """
    Minimal identity summary for an existing patient that matches the name +
    birth date of a new registration attempt.

    Returned inside ``PatientCreateResult.matches`` so the registering staff
    member (or an Admin reviewing the override) can see who the potential
    duplicate is without a second lookup round-trip.
    """

    id: str
    patient_code: str
    full_name: str
    birth_date: date


class PatientCreateResult(BaseSchema):
    """
    Response body for POST /patients.

    Exactly one of the two outcomes is populated:
      - Duplicate detected, not confirmed:
          ``duplicate_warning=True``, ``matches=[...]``, ``patient=None``.
          No record was created. HTTP status is 200 (not an error) — the
          caller re-submits the identical payload with
          ``confirm_duplicate=True`` to bypass the check and register anyway.
      - Registration succeeded (no duplicate found, or the caller already
        set ``confirm_duplicate=True``):
          ``duplicate_warning=False``, ``matches=[]``,
          ``patient=<PatientResponse>``. HTTP status is 201.
    """

    duplicate_warning: bool = Field(
        False, description="True if a duplicate was detected and not confirmed."
    )
    matches: list[PatientDuplicateMatch] = Field(
        default_factory=list,
        description="Existing patients matching name + birth date, when duplicate_warning is True.",
    )
    patient: PatientResponse | None = Field(
        None, description="The newly created patient, when duplicate_warning is False."
    )


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


# ---------------------------------------------------------------------------
# OCR extraction schemas — POST /patients/ocr-extract
# ---------------------------------------------------------------------------


class OcrFieldValue(BaseSchema):
    """
    A single extracted field value with a confidence score.

    ``value`` is None if the field was not found in the image.
    ``confidence`` ranges from 0.0 (not found / unreadable) to 1.0 (certain).
    """

    value: str | None = None
    confidence: float = 0.0  # 0.0–1.0; fields not found have confidence 0.0


class OcrExtractResponse(BaseSchema):
    """
    Response body for POST /patients/ocr-extract.

    All field values are extracted from the submitted ID image.
    Fields that could not be extracted have value=None and confidence=0.0.
    ``raw_text`` is the full OCR output string — included for debugging and
    for the audit log; not displayed to end users.
    ``provider`` identifies which OCR engine processed the image.
    """

    first_name: OcrFieldValue
    middle_name: OcrFieldValue
    last_name: OcrFieldValue
    birth_date: OcrFieldValue       # ISO 8601 (YYYY-MM-DD) if parseable; raw string otherwise
    sex: OcrFieldValue              # normalized to "male" or "female", or None
    address_line: OcrFieldValue
    philhealth_no: OcrFieldValue
    blood_type: OcrFieldValue
    raw_text: str = ""              # full OCR output for debugging
    provider: str = "tesseract"    # "tesseract" | "azure"


# ---------------------------------------------------------------------------
# Archive / Unarchive schemas
# ---------------------------------------------------------------------------


class PatientArchiveRequest(BaseSchema):
    """Body for POST /patients/{id}/archive."""

    reason: str = Field(
        ..., min_length=5, max_length=1000,
        description="Reason for archiving this patient record (required)"
    )


class ArchivedPatientSummary(BaseSchema):
    """
    One row in the archived patients list.

    Extends PatientSummary with archive-specific fields.
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
    blood_type: str | None = None
    created_at: datetime | None = None

    # Archive-specific
    archived_at: datetime
    archived_by: str | None = None
    archive_reason: str | None = None

    # Computed
    age: int = Field(default=0)
    full_name: str = Field(default="")

    @model_validator(mode="after")
    def compute_derived_fields(self) -> "ArchivedPatientSummary":
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


class PaginatedArchivedPatients(BaseSchema):
    """Paginated list of archived patient summaries."""

    items: list[ArchivedPatientSummary]
    total: int
    page: int
    page_size: int
