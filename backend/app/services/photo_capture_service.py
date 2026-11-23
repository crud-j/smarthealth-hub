"""
Phone photo links: take a patient's photo with a phone by scanning a QR code.

The staff PC shows a QR code for one patient. The phone opens the public page
``{QR_BASE_URL}/photo-capture/{token}``, takes the photo and uploads it; the
PC polls and shows it.

A link is a random token in Redis, key ``photo_capture:{token}``, removed by
Redis after ``LINK_LIFETIME``. The value holds only ids and times (no names,
no codes), so neither the QR code nor Redis carries patient details. A link
can upload a photo for its one patient until it expires (a retake replaces
the photo); it can never read the photo or the record.
"""

from __future__ import annotations

import json
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.security import get_shared_redis

LINK_LIFETIME = timedelta(minutes=15)
_KEY_PREFIX = "photo_capture:"


@dataclass(frozen=True)
class PhotoCaptureLink:
    token: str
    patient_id: uuid.UUID
    created_by_id: uuid.UUID
    expires_at: datetime
    uploaded_at: datetime | None = None
    photo_url: str | None = None


def _key(token: str) -> str:
    return f"{_KEY_PREFIX}{token}"


def _to_json(link: PhotoCaptureLink) -> str:
    return json.dumps(
        {
            "patient_id": str(link.patient_id),
            "created_by_id": str(link.created_by_id),
            "expires_at": link.expires_at.isoformat(),
            "uploaded_at": link.uploaded_at.isoformat() if link.uploaded_at else None,
            "photo_url": link.photo_url,
        }
    )


async def create_link(patient_id: uuid.UUID, created_by_id: uuid.UUID) -> PhotoCaptureLink:
    """A new link for ``patient_id``, valid for ``LINK_LIFETIME``."""
    now = datetime.now(UTC).replace(microsecond=0)
    link = PhotoCaptureLink(
        token=secrets.token_urlsafe(32),
        patient_id=patient_id,
        created_by_id=created_by_id,
        expires_at=now + LINK_LIFETIME,
    )
    await get_shared_redis().set(
        _key(link.token), _to_json(link), ex=int(LINK_LIFETIME.total_seconds())
    )
    return link


async def get_link(token: str) -> PhotoCaptureLink | None:
    """The link for ``token``, or None when unknown or expired."""
    if not token or len(token) > 128:
        return None
    raw = await get_shared_redis().get(_key(token))
    if raw is None:
        return None
    data = json.loads(raw)
    link = PhotoCaptureLink(
        token=token,
        patient_id=uuid.UUID(data["patient_id"]),
        created_by_id=uuid.UUID(data["created_by_id"]),
        expires_at=datetime.fromisoformat(data["expires_at"]),
        uploaded_at=datetime.fromisoformat(data["uploaded_at"]) if data["uploaded_at"] else None,
        photo_url=data.get("photo_url"),
    )
    if link.expires_at <= datetime.now(UTC):
        return None
    return link


async def mark_uploaded(link: PhotoCaptureLink, photo_url: str) -> datetime:
    """Record that a photo arrived (the staff screen polls for this); returns the time."""
    uploaded_at = datetime.now(UTC)
    updated = PhotoCaptureLink(
        token=link.token,
        patient_id=link.patient_id,
        created_by_id=link.created_by_id,
        expires_at=link.expires_at,
        uploaded_at=uploaded_at,
        photo_url=photo_url,
    )
    # keepttl: the link still ends at its original expiry.
    await get_shared_redis().set(_key(link.token), _to_json(updated), keepttl=True)
    return uploaded_at


def initials(first_name: str | None, last_name: str | None) -> str:
    """'Ana', 'Reyes' -> 'A. R.' (all the phone page shows about the patient)."""
    parts = [p.strip()[0].upper() + "." for p in (first_name, last_name) if p and p.strip()]
    return " ".join(parts) or "—"
