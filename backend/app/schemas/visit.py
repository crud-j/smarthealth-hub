"""
Pydantic v2 schemas for Visit request/response serialization.

Aligns with the RHU Patient Record form visit log table:
  - case_no        → CASE NO. column
  - visit_date     → DATE / TIME column
  - vital_signs    → VITAL SIGNS column (sub-model)
  - chief_complaint, past_medical_history, present_medical_history
                   → CHIEF COMPLAINT / PAST/PRESENT MEDICAL HISTORY columns
  - diagnosis      → DIAGNOSIS column (AES-256-GCM encrypted)
  - treatment_notes→ TREATMENT column (AES-256-GCM encrypted)

Schemas
-------
VitalSigns     Sub-model: all vital sign fields (all optional — not every visit
               type requires all vitals)
VisitCreate    POST /patients/{id}/visits — body payload
VisitResponse  Full visit record (with decrypted PHI for authorized roles)
VisitSummary   Lightweight row for list endpoint (no PHI)
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas._base import BaseSchema


# ---------------------------------------------------------------------------
# VitalSigns — sub-model (embedded in VisitCreate / VisitResponse)
# ---------------------------------------------------------------------------


class VitalSigns(BaseSchema):
    """
    Vital signs recorded during a visit.

    All fields are optional — BHWs filling in a quick administrative visit
    (e.g., immunization-only) may omit blood pressure or weight.  Clinical
    consultation visits should capture as many as possible.
    """

    blood_pressure: str | None = Field(
        None,
        max_length=20,
        description="Systolic/diastolic, e.g. '120/80 mmHg'",
    )
    temperature: float | None = Field(
        None,
        ge=30.0,
        le=45.0,
        description="Body temperature in degrees Celsius",
    )
    pulse_rate: int | None = Field(
        None,
        ge=20,
        le=300,
        description="Heart rate in beats per minute",
    )
    respiratory_rate: int | None = Field(
        None,
        ge=5,
        le=80,
        description="Respiratory rate in breaths per minute",
    )
    oxygen_saturation: int | None = Field(
        None,
        ge=0,
        le=100,
        description="SpO2 percentage (0–100)",
    )
    weight_kg: float | None = Field(
        None,
        ge=0.5,
        le=500.0,
        description="Patient weight in kilograms",
    )
    height_cm: float | None = Field(
        None,
        ge=30.0,
        le=250.0,
        description="Patient height in centimeters",
    )


# ---------------------------------------------------------------------------
# VisitCreate — POST /patients/{patient_id}/visits
# ---------------------------------------------------------------------------


class VisitCreate(BaseSchema):
    """
    Payload for logging a new patient visit/consultation.

    ``case_no`` is auto-generated server-side (BHC-VISIT-YYYY-NNNNNN) if
    omitted.  ``recorded_by`` is always taken from the authenticated JWT
    (callers cannot override it).

    ``diagnosis`` and ``treatment_notes`` are supplied as plaintext in the
    request body; the service layer encrypts them with AES-256-GCM before
    persisting.
    """

    visit_type: str = Field(
        ...,
        max_length=50,
        description=(
            "Type of visit: 'consultation', 'prenatal_checkup', "
            "'immunization_admin', 'follow_up', 'emergency'"
        ),
    )
    visit_date: datetime | None = Field(
        None,
        description="Visit timestamp (defaults to now() if omitted)",
    )
    case_no: str | None = Field(
        None,
        max_length=30,
        description="Human-readable case number — auto-generated if blank",
    )

    # Vital signs sub-model
    vital_signs: VitalSigns = Field(
        default_factory=VitalSigns,
        description="Vital signs recorded during the visit",
    )

    # Complaint and history fields (CHIEF COMPLAINT / PAST/PRESENT MEDICAL HISTORY)
    chief_complaint: str | None = Field(
        None,
        description="Primary reason for the visit as reported by the patient",
    )
    past_medical_history: str | None = Field(
        None,
        description="Patient's prior conditions and diagnoses relevant to this visit",
    )
    present_medical_history: str | None = Field(
        None,
        description="History of the presenting illness (onset, duration, severity)",
    )

    # PHI fields — supplied as plaintext; service layer encrypts before insert
    diagnosis: str | None = Field(
        None,
        description="Clinical diagnosis — will be AES-256-GCM encrypted before storage",
    )
    treatment_notes: str | None = Field(
        None,
        description="Treatment plan and notes — will be AES-256-GCM encrypted before storage",
    )


# ---------------------------------------------------------------------------
# VisitResponse — full visit record (decrypted PHI for authorized roles)
# ---------------------------------------------------------------------------


class VisitResponse(BaseSchema):
    """
    Full visit record returned to authorized callers.

    ``diagnosis`` and ``treatment_notes`` are returned as decrypted plaintext
    (decryption performed in the service layer before building this response).
    Only Physician/Nurse/Midwife and Admin roles should receive these fields;
    the endpoint enforces role checks before returning them.
    """

    id: str
    patient_id: str
    recorded_by: str | None
    case_no: str | None
    visit_date: datetime
    visit_type: str
    created_at: datetime

    # Vital signs (all nullable)
    blood_pressure: str | None
    temperature: float | None
    pulse_rate: int | None
    respiratory_rate: int | None
    oxygen_saturation: int | None
    weight_kg: float | None
    height_cm: float | None

    # Complaint and history
    chief_complaint: str | None
    past_medical_history: str | None
    present_medical_history: str | None

    # Decrypted PHI fields
    diagnosis: str | None
    treatment_notes: str | None

    # Convenience field added by the service layer (not a DB column)
    patient_name: str | None = Field(
        None,
        description="Full name of the patient — populated by the service layer",
    )


# ---------------------------------------------------------------------------
# VisitSummary — lightweight row for list endpoint (no PHI)
# ---------------------------------------------------------------------------


class VisitSummary(BaseSchema):
    """
    Lightweight visit row for GET /patients/{id}/visits list.

    Does NOT include ``diagnosis`` or ``treatment_notes`` — those fields
    require a dedicated GET /visits/{visit_id} call with clinical-role auth.
    Safe to return to all authenticated staff roles.
    """

    id: str
    patient_id: str
    case_no: str | None
    visit_date: datetime
    visit_type: str
    chief_complaint: str | None
    # Vital signs summary (no PHI)
    blood_pressure: str | None
    temperature: float | None
    pulse_rate: int | None
    created_at: datetime
