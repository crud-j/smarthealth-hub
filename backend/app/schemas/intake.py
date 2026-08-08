"""
Pydantic v2 schemas for the pre-visit patient intake token flow.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas._base import BaseSchema


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


class PendingIntakeSummary(BaseSchema):
    """One row in the GET /intake/pending response."""

    token: str
    created_at: datetime
    expires_at: datetime
    has_draft: bool = Field(..., description="True if the patient has already submitted the form")
    patient_name: str | None = Field(None, description="Name from the draft, if submitted")


class IntakeFinalizeResponse(BaseSchema):
    """Response body for POST /intake/{token}/finalize."""

    patient_id: str = Field(..., description="UUID of the created patient record")
    patient_code: str = Field(..., description="Generated patient code (BHC-YYYY-NNNNNN)")
    registration_data_source: str = Field(
        "pre_visit",
        description="Always 'pre_visit' for intake-finalized records",
    )
