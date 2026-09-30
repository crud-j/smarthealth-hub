"""
Pydantic v2 schemas for the pre-visit patient intake token flow.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import Field

from app.schemas._base import BaseSchema
from app.schemas.patient import PatientCreate


class IntakeTokenResponse(BaseSchema):
    """Response body for POST /patients/intake-token."""

    token: str = Field(..., description="UUID token string for the intake link")
    intake_url: str = Field(..., description="Full URL the patient uses to fill in the form")
    expires_at: datetime = Field(..., description="When this token expires (48 hours from creation)")


class IntakeDraftResponse(BaseSchema):
    """Response body for GET /intake/{token}."""

    token: str
    expires_at: datetime
    draft_data: dict | None = Field(
        None,
        description="Previously saved draft data (null if no draft has been submitted yet)",
    )
    visit_purpose: str | None = None
    purpose_details: dict | None = None


class PendingIntakeSummary(BaseSchema):
    """One row in the GET /intake/pending response."""

    token: str
    created_at: datetime
    expires_at: datetime
    has_draft: bool = Field(..., description="True if the patient has already submitted the form")
    patient_name: str | None = Field(None, description="Name from the draft, if submitted")
    visit_purpose: str | None = None


class IntakeFinalizeResponse(BaseSchema):
    """Response body for POST /intake/{token}/finalize."""

    patient_id: str = Field(..., description="UUID of the created patient record")
    patient_code: str = Field(..., description="Generated patient code (BHC-YYYY-NNNNNN)")
    registration_data_source: str = Field(
        "pre_visit",
        description="Always 'pre_visit' for intake-finalized records",
    )


class IntakeLinkResponse(BaseSchema):
    """Response body for POST /intake/send-link/{appointment_id}."""

    token: str = Field(..., description="UUID token string for the intake link")
    intake_url: str = Field(..., description="Full URL the patient uses to fill in the form")
    sms_sent: bool = Field(..., description="True if the SMS was dispatched successfully")


class IntakeDraftPayload(PatientCreate):
    """
    Body accepted by PUT /intake/{token}.

    Extends PatientCreate with supplemental intake-only fields that are not
    part of the core patient record schema but should be persisted in the
    JSONB draft_data for BHW review before finalization.
    """

    visit_purpose: str | None = Field(
        None,
        max_length=200,
        description="Why the patient is visiting (e.g. 'General Consultation', 'Immunization / Vaccination')",
    )
    visit_purpose_other: str | None = Field(
        None,
        max_length=500,
        description="Free-text elaboration when visit_purpose is 'Others'",
    )
    emergency_contact_relationship: str | None = Field(
        None,
        max_length=100,
        description="Relationship of the emergency contact to the patient (e.g. Spouse, Parent, Sibling)",
    )
    data_capture_date: str | None = Field(
        None,
        max_length=30,
        description="ISO date string of when the patient filled the form (auto-set by frontend)",
    )
    purpose_details: dict | None = Field(
        None,
        description="Purpose-specific fields validated against PurposeDetails discriminated union in the service.",
    )


# ---------------------------------------------------------------------------
# Per-purpose detail models (discriminated union on visit_purpose)
# ---------------------------------------------------------------------------


class GeneralConsultationDetails(BaseSchema):
    visit_purpose: Literal["General Consultation"]
    chief_complaint: str | None = Field(None, max_length=500)
    duration_of_illness: str | None = Field(None, max_length=100)
    current_medications: str | None = Field(None, max_length=1000)
    has_fever: bool = False
    has_cough: bool = False
    has_difficulty_breathing: bool = False


class ImmunizationDetails(BaseSchema):
    visit_purpose: Literal["Immunization / Vaccination"]
    vaccine_name: str | None = Field(None, max_length=200)
    child_age_months: int | None = Field(None, ge=0, le=216)
    is_for_self: bool = True
    is_catch_up: bool = False
    previous_adverse_reaction: str | None = Field(None, max_length=500)


class PrenatalDetails(BaseSchema):
    visit_purpose: Literal["Prenatal / Maternal Care"]
    age_of_gestation_weeks: int | None = Field(None, ge=0, le=45)
    gravida: int | None = Field(None, ge=0)
    para: int | None = Field(None, ge=0)
    has_hypertension: bool = False
    has_gestational_diabetes: bool = False
    is_high_risk: bool = False
    prenatal_visit_number: int | None = Field(None, ge=1, le=20)


class FamilyPlanningDetails(BaseSchema):
    visit_purpose: Literal["Family Planning"]
    current_method: str | None = Field(None, max_length=200)
    reason_for_visit: str | None = Field(None, max_length=500)
    number_of_living_children: int | None = Field(None, ge=0)
    planning_intention: str | None = Field(None, max_length=100)


class DentalDetails(BaseSchema):
    visit_purpose: Literal["Dental Services"]
    chief_dental_complaint: str | None = Field(None, max_length=500)
    affected_area: str | None = Field(None, max_length=200)
    pain_severity: int | None = Field(None, ge=0, le=10)
    duration_of_pain: str | None = Field(None, max_length=100)
    last_dental_visit_years: int | None = Field(None, ge=0)
    has_bleeding_gums: bool = False
    service_requested: str | None = Field(None, max_length=200)


class TBDotsDetails(BaseSchema):
    visit_purpose: Literal["TB-DOTS Program"]
    is_new_case: bool = True
    tb_registration_number: str | None = Field(None, max_length=50)
    treatment_month: int | None = Field(None, ge=1, le=24)
    has_cough_2_weeks: bool = False
    has_hemoptysis: bool = False
    has_night_sweats: bool = False
    has_weight_loss: bool = False
    has_close_contact: bool = False


class ChildHealthDetails(BaseSchema):
    visit_purpose: Literal["Child Health / Growth Monitoring"]
    child_age_months: int | None = Field(None, ge=0, le=60)
    muac_cm: float | None = Field(None, ge=5.0, le=40.0)
    nutritional_status: str | None = Field(None, max_length=50)
    is_fully_immunized: bool | None = None
    vitamin_a_given: bool = False
    deworming_given: bool = False
    concern: str | None = Field(None, max_length=500)


class HypertensionDetails(BaseSchema):
    visit_purpose: Literal["Hypertension / BP Monitoring"]
    reported_bp_systolic: int | None = Field(None, ge=60, le=300)
    reported_bp_diastolic: int | None = Field(None, ge=40, le=200)
    is_on_medication: bool = False
    current_medications: str | None = Field(None, max_length=500)
    has_headache: bool = False
    has_dizziness: bool = False
    has_chest_pain: bool = False
    last_bp_check: str | None = Field(None, max_length=50)


class DiabetesDetails(BaseSchema):
    visit_purpose: Literal["Diabetes Management"]
    reported_fasting_glucose: float | None = Field(None, ge=0, le=600)
    is_on_insulin: bool = False
    is_on_oral_medication: bool = False
    current_medications: str | None = Field(None, max_length=500)
    has_polyuria: bool = False
    has_polydipsia: bool = False
    has_poor_wound_healing: bool = False
    last_hba1c: str | None = Field(None, max_length=20)


class WoundCareDetails(BaseSchema):
    visit_purpose: Literal["Wound Care / Dressing"]
    wound_location: str | None = Field(None, max_length=200)
    wound_cause: str | None = Field(None, max_length=300)
    wound_age_days: int | None = Field(None, ge=0)
    has_signs_of_infection: bool = False
    is_post_surgical: bool = False
    tetanus_status: str | None = Field(None, max_length=100)


class NutritionDetails(BaseSchema):
    visit_purpose: Literal["Nutrition Counseling"]
    referred_by: str | None = Field(None, max_length=200)
    concern: str | None = Field(None, max_length=500)
    target_group: str | None = Field(None, max_length=100)


class SeniorHealthDetails(BaseSchema):
    visit_purpose: Literal["Senior Citizens Health Check"]
    chief_complaint: str | None = Field(None, max_length=500)
    has_hypertension: bool = False
    has_diabetes: bool = False
    has_arthritis: bool = False
    has_visual_impairment: bool = False
    has_hearing_impairment: bool = False
    mobility_status: str | None = Field(None, max_length=100)
    current_medications: str | None = Field(None, max_length=1000)


class MedicalCertificateDetails(BaseSchema):
    visit_purpose: Literal["Medical Certificate"]
    purpose_of_certificate: str | None = Field(None, max_length=300)
    requesting_entity: str | None = Field(None, max_length=200)


class OthersDetails(BaseSchema):
    visit_purpose: Literal["Others"]
    free_text_purpose: str | None = Field(None, max_length=500)
    chief_complaint: str | None = Field(None, max_length=500)


PurposeDetails = Annotated[
    Union[
        GeneralConsultationDetails,
        ImmunizationDetails,
        PrenatalDetails,
        FamilyPlanningDetails,
        DentalDetails,
        TBDotsDetails,
        ChildHealthDetails,
        HypertensionDetails,
        DiabetesDetails,
        WoundCareDetails,
        NutritionDetails,
        SeniorHealthDetails,
        MedicalCertificateDetails,
        OthersDetails,
    ],
    Field(discriminator="visit_purpose"),
]


# ---------------------------------------------------------------------------
# Staff-facing intake detail response (JWT-required endpoint)
# ---------------------------------------------------------------------------


class IntakeDetailResponse(BaseSchema):
    """Response body for GET /intake/{token}/details (BHW+ only)."""

    token: str
    expires_at: datetime
    used_at: datetime | None = None
    visit_purpose: str | None = None
    purpose_details: dict | None = None
    draft_data: dict | None = None
    patient_id: str | None = None
    appointment_id: str | None = None
    created_at: datetime
