"""
Pydantic v2 schemas for the medical_history domain.

Three schema classes are exported:

MedicalHistoryCreate
    POST /patients/{patient_id}/medical-history request body.
    ``notes`` is supplied as plaintext — the service layer encrypts it with
    AES-256-GCM before inserting into the database.

MedicalHistoryResponse
    Full single-entry response (GET /patients/{id}/medical-history/{entry_id}).
    ``notes`` is the *decrypted* value for Physician/Admin callers; the
    service layer sets it to ``None`` for BHW/admin_staff to enforce role-
    based PHI access.

MedicalHistoryListItem
    Lightweight row shape used in the list response. ``notes`` is always
    omitted from list views (PHI minimisation for all roles). The boolean
    field ``redacted`` signals to the frontend that notes exist but were
    not returned.

SDP Reference: Section 4.2 (schema) and Section 6.3 (API contracts).
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from pydantic import Field

from app.schemas._base import BaseSchema


# ---------------------------------------------------------------------------
# Severity enum
# ---------------------------------------------------------------------------


class SeverityEnum(str, Enum):
    """
    Permitted values for MedicalHistory.severity.

    Matches the CHECK constraint defined in the migration and ORM model.
    Using a str Enum means FastAPI auto-documents the allowed values in the
    OpenAPI schema and Pydantic raises a clear validation error on bad input.
    """

    mild = "mild"
    moderate = "moderate"
    severe = "severe"


# ---------------------------------------------------------------------------
# MedicalHistoryCreate — POST body
# ---------------------------------------------------------------------------


class MedicalHistoryCreate(BaseSchema):
    """
    Request body for adding a new medical history entry.

    ``condition_name`` is the only required field; all other fields are
    optional to accommodate variable data availability in a BHC setting
    (e.g., a condition may be recorded without a known severity or exact
    diagnosis date).

    ``notes`` should be supplied as **plaintext** by the API caller — the
    service layer is responsible for encrypting it before storage.
    """

    condition_name: str = Field(
        ...,
        min_length=1,
        max_length=150,
        description=(
            "Human-readable name of the condition or clinical event, "
            "e.g. 'Type 2 Diabetes Mellitus', 'Hypertension', 'Asthma'."
        ),
    )
    severity: SeverityEnum | None = Field(
        None,
        description="Clinical severity: 'mild', 'moderate', or 'severe'. Optional.",
    )
    diagnosed_date: date | None = Field(
        None,
        description=(
            "Date the condition was first clinically diagnosed. "
            "ISO-8601 date (YYYY-MM-DD). Optional."
        ),
    )
    notes: str | None = Field(
        None,
        description=(
            "Clinical notes about this condition (plaintext). "
            "The service layer encrypts this with AES-256-GCM before storage. "
            "Only Physician/Admin roles can retrieve the decrypted value later."
        ),
    )


# ---------------------------------------------------------------------------
# MedicalHistoryResponse — full single-entry response (with optional PHI)
# ---------------------------------------------------------------------------


class MedicalHistoryResponse(BaseSchema):
    """
    Full medical history entry returned from the service layer.

    UUID fields (``id``, ``patient_id``, ``recorded_by``) are serialised as
    strings for consistent JSON representation across environments.

    ``notes`` behaviour:
    - For Physician/Admin callers: decrypted plaintext value (or None if no
      notes were stored).
    - For BHW/admin_staff callers: always None (PHI access is denied at the
      service layer; the caller should inspect ``redacted`` instead).

    ``redacted``:
    - True  → notes exist in the database but were withheld due to role.
    - False → notes are either absent or were returned in the ``notes`` field.
    """

    id: str = Field(description="UUID of this medical history entry (as string).")
    patient_id: str = Field(description="UUID of the patient this entry belongs to.")
    condition_name: str = Field(description="Name of the diagnosed condition.")
    severity: str | None = Field(None, description="Condition severity level.")
    diagnosed_date: date | None = Field(None, description="Date of diagnosis.")
    recorded_by: str | None = Field(
        None,
        description="UUID of the staff member who recorded this entry (as string).",
    )
    created_at: datetime = Field(description="Timestamp when the entry was created.")

    # PHI field — decrypted for authorized roles, None for restricted roles
    notes: str | None = Field(
        None,
        description=(
            "Decrypted clinical notes (Physician/Admin only). "
            "None if the caller's role does not have PHI access, or if no notes "
            "were recorded."
        ),
    )
    # Signals to the frontend whether notes were withheld
    redacted: bool = Field(
        False,
        description=(
            "True if notes exist in the database but were not returned due to "
            "role-based access control."
        ),
    )


# ---------------------------------------------------------------------------
# MedicalHistoryListItem — lightweight row for list endpoint (no PHI)
# ---------------------------------------------------------------------------


class MedicalHistoryListItem(BaseSchema):
    """
    Lightweight row shape for GET /patients/{patient_id}/medical-history list.

    ``notes`` is deliberately absent — list views never return PHI regardless
    of caller role.  The ``redacted`` flag indicates whether notes were stored
    for this entry, so the frontend can show a "view notes" call-to-action for
    clinical roles.
    """

    id: str = Field(description="UUID of this medical history entry (as string).")
    patient_id: str = Field(description="UUID of the patient this entry belongs to.")
    condition_name: str = Field(description="Name of the diagnosed condition.")
    severity: str | None = Field(None, description="Condition severity level.")
    diagnosed_date: date | None = Field(None, description="Date of diagnosis.")
    recorded_by: str | None = Field(
        None,
        description="UUID of the staff member who recorded this entry (as string).",
    )
    created_at: datetime = Field(description="Timestamp when the entry was created.")

    # notes is intentionally absent — omitted from all list views (PHI minimisation)
    redacted: bool = Field(
        description=(
            "True if clinical notes exist for this entry (but are never returned "
            "in the list view for any role). "
            "Use GET /patients/{id}/medical-history/{entry_id} to retrieve the "
            "decrypted notes if you have Physician/Admin role."
        ),
    )


# ---------------------------------------------------------------------------
# MedicalHistoryListResponse — envelope for the list endpoint
# ---------------------------------------------------------------------------


class MedicalHistoryListResponse(BaseSchema):
    """
    Envelope returned by GET /patients/{patient_id}/medical-history.

    Wraps the list of items with a ``total`` count and a top-level
    ``redacted`` flag that is True if *any* item in the list has notes.
    This lets the frontend render a single banner ("Some entries have
    clinical notes — use a clinical role to access them.") rather than
    checking every row.
    """

    patient_id: str = Field(description="UUID of the patient (as string).")
    items: list[MedicalHistoryListItem] = Field(
        description="All medical history entries for this patient, newest first.",
    )
    total: int = Field(description="Total number of entries returned.")
    redacted: bool = Field(
        description="True if any entry has notes that were withheld.",
    )
