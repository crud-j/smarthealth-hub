"""
Patient photo service — upload, save, and retrieve patient profile photos.

Responsibilities
----------------
- validate_and_save_photo
    Accept a raw file upload (UploadFile), enforce:
      • Allowed MIME types: image/jpeg, image/png, image/webp
      • Max size: settings.MAX_PHOTO_UPLOAD_BYTES (default 5 MiB)
    Convert the accepted image to JPEG using Pillow (consistent output,
    smaller PDF embeds), then save to:
      <settings.MEDIA_DIR>/patient_photos/<patient_id>.jpg
    Update ``patients.photo_path`` in the DB and write an UPDATE audit log.

- get_photo_path
    Return the absolute filesystem path for a patient's current photo, or
    None if no photo exists.

- get_photo_data_uri
    Return a base64-encoded data URI (image/jpeg) for embedding into a
    WeasyPrint PDF template.  Returns a static placeholder SVG data URI if
    no photo is stored.

Security notes
--------------
- The media directory is served by FastAPI's StaticFiles only when accessed
  through an authenticated endpoint.  Raw filesystem paths are never surfaced
  to the client in the photo_path column — the API returns a URL instead.
- Pillow's Image.open() is called with a BytesIO buffer (not with the raw
  path) to prevent path traversal through crafted filenames.
- File content is validated via Pillow verify() before conversion — this
  catches truncated or corrupt uploads.
- Photo files are written with a patient-UUID-derived filename, never with
  the original filename supplied by the client.
"""

from __future__ import annotations

import asyncio
import base64
import io
import pathlib
import uuid
from datetime import datetime

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.patient import Patient
from app.services.audit_service import write_audit_log

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Accepted MIME types for uploads; anything else is rejected with HTTP 422.
_ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset(
    {"image/jpeg", "image/png", "image/webp"}
)

# Sub-directory within MEDIA_DIR where all patient photos are stored.
_PHOTO_SUBDIR = "patient_photos"

# Inline placeholder SVG used in PDFs when a patient has no photo.
# A simple monochrome silhouette — no external resource dependencies.
_PLACEHOLDER_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
    'width="100" height="100">'
    '<rect width="100" height="100" fill="#e2e8f0"/>'
    '<circle cx="50" cy="35" r="18" fill="#94a3b8"/>'
    '<ellipse cx="50" cy="80" rx="28" ry="22" fill="#94a3b8"/>'
    "</svg>"
)
_PLACEHOLDER_DATA_URI = (
    "data:image/svg+xml;base64,"
    + base64.b64encode(_PLACEHOLDER_SVG.encode()).decode()
)

# Target JPEG quality for saved photos — balances file size vs. print clarity.
_JPEG_QUALITY = 85


# ---------------------------------------------------------------------------
# Photo storage directory initialisation
# ---------------------------------------------------------------------------


def ensure_photo_dir() -> pathlib.Path:
    """
    Ensure the patient photos directory exists and return its absolute path.

    Called once on application startup (from main.py lifespan) and also
    lazily on first upload so tests do not need to pre-create the directory.
    """
    photo_dir = settings.MEDIA_DIR / _PHOTO_SUBDIR
    photo_dir.mkdir(parents=True, exist_ok=True)
    return photo_dir


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _photo_path_for(patient_id: uuid.UUID) -> pathlib.Path:
    """Return the absolute path where a patient's photo is/would be stored."""
    return ensure_photo_dir() / f"{patient_id}.jpg"


def _relative_photo_path(patient_id: uuid.UUID) -> str:
    """
    Return the relative DB-stored path string for a patient photo.

    Stored as: "patient_photos/<uuid>.jpg"
    This is relative to settings.MEDIA_DIR so it remains portable if
    MEDIA_DIR is changed.
    """
    return f"{_PHOTO_SUBDIR}/{patient_id}.jpg"


def _convert_to_jpeg(raw_bytes: bytes) -> bytes:
    """
    Open the uploaded image with Pillow and re-save it as JPEG.

    Steps:
    1. Verify the image is not corrupt (PIL verify pass).
    2. Re-open (verify() exhausts the stream and must be followed by re-open).
    3. Convert to RGB (JPEG does not support transparency/palette modes).
    4. Save at _JPEG_QUALITY and return raw bytes.

    Raises:
        AppError: If the file cannot be opened as a valid image.
    """
    try:
        # Verify first (detects truncated / corrupt files)
        with Image.open(io.BytesIO(raw_bytes)) as img:
            img.verify()
    except (UnidentifiedImageError, Exception) as exc:
        raise ValidationError(
            f"Uploaded file is not a valid image: {exc}",
            detail={"code": "INVALID_IMAGE"},
        ) from exc

    # Must re-open after verify() — verify() consumes the image data.
    with Image.open(io.BytesIO(raw_bytes)) as img:
        # Flatten alpha channel / palette before JPEG encode
        rgb_img = img.convert("RGB")
        output = io.BytesIO()
        rgb_img.save(output, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
        return output.getvalue()


def _save_jpeg_sync(dest_path: pathlib.Path, jpeg_bytes: bytes) -> None:
    """Write JPEG bytes to disk (blocking I/O — run in thread)."""
    dest_path.write_bytes(jpeg_bytes)


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def validate_and_save_photo(
    db: AsyncSession,
    patient_id: uuid.UUID,
    upload: UploadFile,
    updated_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> str:
    """
    Validate, convert, and persist a patient profile photo.

    Steps:
    1. Verify the patient exists.
    2. Validate MIME type against the allowed list.
    3. Read upload content and enforce max-size limit.
    4. Convert to JPEG with Pillow (validates image integrity).
    5. Write JPEG to disk (offloaded to a thread — blocking I/O).
    6. Update ``patients.photo_path`` in the DB.
    7. Write an UPDATE audit log entry.
    8. Commit and return the publicly accessible URL path.

    Args:
        db:              Active async database session.
        patient_id:      UUID of the patient whose photo is being updated.
        upload:          FastAPI UploadFile from the multipart request.
        updated_by_id:   UUID of the staff member performing the upload.
        ip_address:      Client IP for the audit log.

    Returns:
        A URL-relative path string usable by the frontend to construct the
        photo URL, e.g. "/media/patient_photos/<uuid>.jpg".

    Raises:
        NotFoundError:  Patient does not exist.
        AppError:       File type not allowed, file too large, or corrupt image.
    """
    # 1. Confirm patient exists
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient: Patient | None = result.scalar_one_or_none()
    if patient is None:
        raise NotFoundError(f"Patient with ID {patient_id} was not found.")

    # 2. Validate MIME type
    content_type: str = upload.content_type or ""
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise ValidationError(
            f"Unsupported file type: '{content_type}'. "
            "Accepted types: image/jpeg, image/png, image/webp.",
            detail={"code": "UNSUPPORTED_FILE_TYPE", "received": content_type},
        )

    # 3. Read and size-check upload content
    raw_bytes = await upload.read()
    if len(raw_bytes) > settings.MAX_PHOTO_UPLOAD_BYTES:
        max_mb = settings.MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024)
        raise ValidationError(
            f"File too large. Maximum allowed size is {max_mb:.1f} MiB.",
            detail={"code": "FILE_TOO_LARGE", "max_bytes": settings.MAX_PHOTO_UPLOAD_BYTES},
        )
    if len(raw_bytes) == 0:
        raise ValidationError(
            "Uploaded file is empty.",
            detail={"code": "EMPTY_FILE"},
        )

    # 4. Convert to JPEG (also validates image integrity via Pillow)
    jpeg_bytes = _convert_to_jpeg(raw_bytes)

    # 5. Write to disk in a thread (blocking I/O must not block the event loop)
    dest_path = _photo_path_for(patient_id)
    await asyncio.to_thread(_save_jpeg_sync, dest_path, jpeg_bytes)

    # 6. Update DB record
    relative_path = _relative_photo_path(patient_id)
    patient.photo_path = relative_path
    patient.updated_at = datetime.utcnow()  # type: ignore[assignment]

    # 7. Audit log
    await write_audit_log(
        db=db,
        user_id=updated_by_id,
        action="UPDATE",
        entity_type="patient",
        entity_id=patient_id,
        metadata={
            "changed_fields": ["photo_path"],
            "file_size_bytes": len(jpeg_bytes),
            "original_content_type": content_type,
        },
        ip_address=ip_address,
    )

    await db.commit()

    url_path = f"/media/{relative_path}"
    logger.info(
        "Patient photo saved",
        extra={
            "patient_id": str(patient_id),
            "by": str(updated_by_id),
            "size_bytes": len(jpeg_bytes),
            "dest": str(dest_path),
        },
    )
    return url_path


def get_photo_path(patient: Patient) -> pathlib.Path | None:
    """
    Return the absolute filesystem path for a patient's current photo.

    Returns None if the patient has no photo stored (photo_path is NULL).
    Does not verify that the file actually exists on disk — callers should
    check ``.exists()`` themselves if they need to guard against orphaned DB
    records.
    """
    if not patient.photo_path:
        return None
    return settings.MEDIA_DIR / patient.photo_path


def get_photo_data_uri(patient: Patient) -> str:
    """
    Return a base64-encoded JPEG data URI for embedding in a WeasyPrint PDF.

    If the patient has no photo or the photo file has been deleted from disk,
    returns the static placeholder SVG data URI so the health card always
    renders a non-broken image in the photo box.

    This function performs synchronous file I/O (``pathlib.Path.read_bytes``).
    When called from the async PDF-rendering path it is already wrapped in
    ``asyncio.to_thread(render_health_card_pdf, ...)`` so it need not be
    awaited separately.
    """
    photo_path = get_photo_path(patient)
    if photo_path is None or not photo_path.exists():
        return _PLACEHOLDER_DATA_URI

    try:
        raw = photo_path.read_bytes()
        b64 = base64.b64encode(raw).decode()
        return f"data:image/jpeg;base64,{b64}"
    except OSError:
        logger.warning(
            "Failed to read patient photo from disk — using placeholder",
            extra={"path": str(photo_path)},
        )
        return _PLACEHOLDER_DATA_URI
