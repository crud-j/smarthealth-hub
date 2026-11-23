"""
Pydantic v2 schemas for patient profile photo endpoints.

Kept in a separate module to avoid circular imports between
patient.py schemas and the photo endpoint/service modules.
"""

from __future__ import annotations

from datetime import datetime

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


# ---------------------------------------------------------------------------
# Phone photo links (QR code on the staff screen -> photo from a phone)
# ---------------------------------------------------------------------------


class PhotoCaptureLinkResponse(BaseModel):
    """A new phone photo link for the staff screen to show as a QR code."""

    token: str = Field(description="Random link token (no patient details).")
    capture_url: str = Field(
        description="Public page the phone opens: {QR_BASE_URL}/photo-capture/{token}."
    )
    expires_at: datetime = Field(description="The link stops working at this time.")


class PhotoCaptureStatusResponse(BaseModel):
    """Staff screen poll: has the phone sent a photo yet?"""

    expires_at: datetime
    uploaded_at: datetime | None = Field(None, description="Last photo received through this link.")
    photo_url: str | None = Field(None, description="Authenticated photo URL once a photo arrived.")


class PhotoCapturePageResponse(BaseModel):
    """What the (signed-out) phone page may see: initials only."""

    patient_initials: str = Field(description="e.g. 'A. R.', so staff can check the patient.")
    expires_at: datetime
    uploaded_at: datetime | None = None


class PhotoCaptureUploadResponse(BaseModel):
    """Answer to the phone after an upload (no photo URL: the phone cannot read it)."""

    message: str
    uploaded_at: datetime
