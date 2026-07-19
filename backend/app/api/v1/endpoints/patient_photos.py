"""
Patient profile photo endpoints.

  POST  /patients/{patient_id}/photo   — Upload or replace patient photo
  GET   /patients/{patient_id}/photo   — Stream back the photo file

Both endpoints require JWT authentication.  Upload is restricted to BHW,
physician, admin_staff, and admin roles (same as patient record writes).
GET is available to any authenticated staff role.

Swagger UI testability
----------------------
The POST endpoint uses ``File(...)`` rather than ``Form(...)`` so that
Swagger UI renders a proper file-picker input.  The ``media_type`` is set to
``multipart/form-data`` and ``openapi_extra`` injects the correct request
body schema so the "Try it out" button works without additional client config.

SDP Reference: Section 6.2 (Patient Records), Section 8 (Health Cards)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import FileResponse

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.patient_photo import PhotoUploadResponse
from app.services import patient_photo_service
from app.services.patient_service import get_patient

logger = get_logger(__name__)

router = APIRouter(tags=["patients"])

# Roles permitted to upload photos (same as patient record writes)
_BHW_PLUS = require_role("bhw", "physician", "admin_staff", "admin")


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _get_client_ip(request: Request) -> str | None:
    """Extract real client IP, honouring X-Forwarded-For."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


# ---------------------------------------------------------------------------
# POST /patients/{patient_id}/photo
# ---------------------------------------------------------------------------


@router.post(
    "/patients/{patient_id}/photo",
    response_model=PhotoUploadResponse,
    summary="Upload patient profile photo",
    description=(
        "Upload a JPEG, PNG, or WebP image to use as the patient's profile photo "
        "on printed health cards.  The image is converted to JPEG server-side for "
        "consistency.  Maximum size: 5 MiB.\n\n"
        "**Swagger UI usage:** click *Try it out*, then use the file-picker to "
        "select an image and click *Execute*.  A valid JWT Bearer token is required "
        "(set via the *Authorize* button)."
    ),
    dependencies=[_BHW_PLUS],
    openapi_extra={
        "requestBody": {
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["photo"],
                        "properties": {
                            "photo": {
                                "type": "string",
                                "format": "binary",
                                "description": (
                                    "Patient profile photo. "
                                    "Accepted formats: JPEG, PNG, WebP. "
                                    "Maximum size: 5 MiB."
                                ),
                            }
                        },
                    }
                }
            },
            "required": True,
        }
    },
)
async def upload_patient_photo(
    patient_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
    photo: UploadFile = File(
        ...,
        description="Patient profile photo (JPEG / PNG / WebP, max 5 MiB).",
    ),
) -> PhotoUploadResponse:
    """
    Accept a multipart image upload, validate and convert it to JPEG, store it
    on disk under ``backend/media/patient_photos/<patient_id>.jpg``, update the
    patient record with the new ``photo_path``, and write an audit log entry.

    Returns a ``PhotoUploadResponse`` containing the URL path to the saved
    photo, which the frontend can use to display a preview.

    Auth: BHW, Physician/Nurse/Midwife, Admin Staff, Admin.
    """
    ip = _get_client_ip(request)

    url_path = await patient_photo_service.validate_and_save_photo(
        db=db,
        patient_id=patient_id,
        upload=photo,
        updated_by_id=current_user.id,
        ip_address=ip,
    )

    return PhotoUploadResponse(
        patient_id=str(patient_id),
        photo_url=url_path,
        message="Profile photo uploaded successfully.",
    )


# ---------------------------------------------------------------------------
# GET /patients/{patient_id}/photo
# ---------------------------------------------------------------------------


@router.get(
    "/patients/{patient_id}/photo",
    summary="Get patient profile photo",
    description=(
        "Stream the stored JPEG photo for a patient.  Returns 404 if no "
        "photo has been uploaded yet.  Requires JWT authentication."
    ),
    response_class=FileResponse,
    responses={
        200: {
            "content": {"image/jpeg": {}},
            "description": "Patient profile photo as JPEG.",
        },
        404: {"description": "Patient not found, or no photo uploaded yet."},
    },
)
async def get_patient_photo(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> FileResponse:
    """
    Return the patient's profile photo as a ``FileResponse`` (image/jpeg).

    Fetches the patient record to resolve the ``photo_path``, then streams
    the file directly from disk.  If the patient has no photo on record,
    returns a 404 so callers can fall back to a placeholder in the UI.

    Auth: Any authenticated staff role.
    """
    patient = await get_patient(db, patient_id)

    photo_path = patient_photo_service.get_photo_path(patient)
    if photo_path is None or not photo_path.exists():
        raise NotFoundError(
            f"No profile photo found for patient {patient_id}."
        )

    return FileResponse(
        path=str(photo_path),
        media_type="image/jpeg",
        filename=f"patient_{patient_id}.jpg",
    )
