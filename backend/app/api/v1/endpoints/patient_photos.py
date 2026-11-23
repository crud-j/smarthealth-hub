"""
Patient profile photo endpoints.

  POST  /patients/{patient_id}/photo   — Upload or replace patient photo
  GET   /patients/{patient_id}/photo   — Stream back the photo file

  POST  /patients/{patient_id}/photo-capture          — Phone photo link (QR code)
  GET   /patients/{patient_id}/photo-capture/{token}  — Has the phone sent a photo?
  GET   /photo-capture/{token}                        — PUBLIC: phone page (initials only)
  POST  /photo-capture/{token}                        — PUBLIC: phone uploads the photo

The /patients/... endpoints require JWT authentication.  Upload and phone
links are restricted to BHW, physician, admin_staff, and admin roles (same as
patient record writes).  GET photo is available to any authenticated staff role.

The two /photo-capture/{token} endpoints are public on purpose: the phone that
scans the QR code is not signed in.  The random token (15 minutes, one
patient) is the permission; it can only upload a photo, never read the photo
or the record, and every upload is audited as the staff member who made the
link (see app.services.photo_capture_service).

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

from fastapi import APIRouter, File, Request, UploadFile, status
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.patient_photo import (
    PhotoCaptureLinkResponse,
    PhotoCapturePageResponse,
    PhotoCaptureStatusResponse,
    PhotoCaptureUploadResponse,
    PhotoUploadResponse,
)
from app.services import patient_photo_service, photo_capture_service
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
        raise NotFoundError(f"No profile photo found for patient {patient_id}.")

    return FileResponse(
        path=str(photo_path),
        media_type="image/jpeg",
        filename=f"patient_{patient_id}.jpg",
        # Browser cache only (never proxies/CDNs). photo_api_url adds ?v=<mtime>,
        # so a re-uploaded photo gets a new URL.
        headers={"Cache-Control": "private, max-age=86400"},
    )


# ---------------------------------------------------------------------------
# Phone photo link: POST /patients/{patient_id}/photo-capture
# ---------------------------------------------------------------------------

_LINK_NOT_FOUND = (
    "This photo link has expired or does not exist. Make a new QR code on the computer."
)


@router.post(
    "/patients/{patient_id}/photo-capture",
    response_model=PhotoCaptureLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Make a phone photo link (shown as a QR code)",
    description=(
        "A 15-minute link for one patient. The phone that opens it can upload the "
        "patient's photo (and retake it) without signing in; it cannot read anything."
    ),
    dependencies=[_BHW_PLUS],
)
async def create_photo_capture_link(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> PhotoCaptureLinkResponse:
    await get_patient(db, patient_id)  # 404 for an unknown patient
    await limiter.check_rate_limit(
        key=f"photo_capture_link:{current_user.id}", max_attempts=30, window_seconds=600
    )
    link = await photo_capture_service.create_link(patient_id, current_user.id)
    return PhotoCaptureLinkResponse(
        token=link.token,
        capture_url=f"{settings.QR_BASE_URL.rstrip('/')}/photo-capture/{link.token}",
        expires_at=link.expires_at,
    )


@router.get(
    "/patients/{patient_id}/photo-capture/{token}",
    response_model=PhotoCaptureStatusResponse,
    summary="Has the phone sent a photo yet? (polled by the staff screen)",
    dependencies=[_BHW_PLUS],
)
async def get_photo_capture_status(
    patient_id: uuid.UUID,
    token: str,
) -> PhotoCaptureStatusResponse:
    link = await photo_capture_service.get_link(token)
    if link is None or link.patient_id != patient_id:
        raise NotFoundError(_LINK_NOT_FOUND)
    return PhotoCaptureStatusResponse(
        expires_at=link.expires_at,
        uploaded_at=link.uploaded_at,
        photo_url=link.photo_url,
    )


# ---------------------------------------------------------------------------
# PUBLIC phone page: GET / POST /photo-capture/{token}
# ---------------------------------------------------------------------------


@router.get(
    "/photo-capture/{token}",
    response_model=PhotoCapturePageResponse,
    summary="Phone photo page: check the link (public, initials only)",
)
async def get_photo_capture_page(
    token: str,
    request: Request,
    db: DbDep,
) -> PhotoCapturePageResponse:
    await limiter.check_rate_limit(
        key=f"photo_capture_view:{_get_client_ip(request) or 'unknown'}",
        max_attempts=60,
        window_seconds=60,
    )
    link = await photo_capture_service.get_link(token)
    if link is None:
        raise NotFoundError(_LINK_NOT_FOUND)
    patient = await get_patient(db, link.patient_id)
    return PhotoCapturePageResponse(
        patient_initials=photo_capture_service.initials(patient.first_name, patient.last_name),
        expires_at=link.expires_at,
        uploaded_at=link.uploaded_at,
    )


@router.post(
    "/photo-capture/{token}",
    response_model=PhotoCaptureUploadResponse,
    summary="Phone photo page: upload the patient's photo (public)",
    description=(
        "Multipart field ``photo`` (JPEG / PNG / WebP, max 5 MiB). Replaces the "
        "patient's photo; audited as the staff member who made the link. At most "
        "10 uploads per link."
    ),
)
async def upload_photo_from_phone(
    token: str,
    request: Request,
    db: DbDep,
    photo: UploadFile = File(..., description="Patient photo taken on the phone."),
) -> PhotoCaptureUploadResponse:
    ip = _get_client_ip(request)
    link = await photo_capture_service.get_link(token)
    if link is None:
        raise NotFoundError(_LINK_NOT_FOUND)
    await limiter.check_rate_limit(
        key=f"photo_capture_upload:{token}",
        max_attempts=10,
        window_seconds=int(photo_capture_service.LINK_LIFETIME.total_seconds()),
    )

    url_path = await patient_photo_service.validate_and_save_photo(
        db=db,
        patient_id=link.patient_id,
        upload=photo,
        updated_by_id=link.created_by_id,
        ip_address=ip,
        source="phone_capture",
    )
    uploaded_at = await photo_capture_service.mark_uploaded(link, url_path)
    logger.info(
        "Patient photo received from a phone link",
        extra={"patient_id": str(link.patient_id), "link_by": str(link.created_by_id)},
    )
    return PhotoCaptureUploadResponse(
        message="Photo sent. It is now on the computer.",
        uploaded_at=uploaded_at,
    )
