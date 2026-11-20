"""
Pydantic v2 schemas for patient profile photo endpoints.

Kept in a separate module to avoid circular imports between
patient.py schemas and the photo endpoint/service modules.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class PhotoUploadResponse(BaseModel):
    """
    Response returned after a successful photo upload.

    ``photo_url`` is a root-relative URL path (e.g. ``/api/v1/patients/<id>/photo?v=<n>``)
    that the frontend can append to the API base URL to display or download
    the uploaded photo.
    """

    patient_id: str = Field(description="UUID of the patient whose photo was uploaded.")
    photo_url: str = Field(
        description=(
            "Root-relative URL path to the stored photo, "
            "e.g. '/api/v1/patients/3fa8...-6afa6/photo?v=1732060800'."
        )
    )
    message: str = Field(description="Human-readable confirmation message.")

    model_config = {"from_attributes": True}
