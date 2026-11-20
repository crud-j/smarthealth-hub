"""
Patient photos and stored card PDFs must not be reachable without login.

The backend used to mount ``settings.MEDIA_DIR`` publicly at ``/media``.
Photos are stored as ``patient_photos/<patient_id>.jpg`` and the patient id is
part of every QR / NFC card link, so anyone who scanned a card could fetch the
patient's photo with no login.  Stored card PDFs (``health_cards/<card_id>.pdf``)
were equally public to anyone holding the link.

Now:
  - there is no ``/media`` route at all;
  - photos are served only by ``GET /api/v1/patients/{id}/photo`` (JWT header or
    the httpOnly ``access_token`` cookie, which is what a browser ``<img>`` sends);
  - every API response points at that endpoint, never at ``/media/...``.
"""

from __future__ import annotations

import pathlib
import uuid
from collections.abc import Iterator
from datetime import date

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token
from app.models.patient import Patient
from app.services.patient_photo_service import photo_api_url

# Smallest valid JPEG header + EOI is enough for a FileResponse round trip.
_JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 16 + b"\xff\xd9"


@pytest.fixture
def media_file() -> Iterator[pathlib.Path]:
    """A real file inside MEDIA_DIR, removed after the test."""
    created: list[pathlib.Path] = []

    def _make(relative: str) -> pathlib.Path:
        path = settings.MEDIA_DIR / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(_JPEG_BYTES)
        created.append(path)
        return path

    yield _make  # type: ignore[misc]
    for path in created:
        path.unlink(missing_ok=True)


@pytest_asyncio.fixture
async def patient_with_photo(db_session: AsyncSession, make_user, media_file) -> Patient:
    user = await make_user("bhw")
    patient_id = uuid.uuid4()
    relative = f"patient_photos/{patient_id}.jpg"
    media_file(relative)
    patient = Patient(
        id=patient_id,
        patient_code=f"BHC-2026-{uuid.uuid4().hex[:6].upper()}",
        first_name="Photo",
        last_name="Patient",
        birth_date=date(1990, 1, 1),
        sex="female",
        address="Turo, Bocaue, Bulacan",
        is_active=True,
        is_senior=False,
        is_pwd=False,
        is_pregnant=False,
        created_by=user.id,
        photo_path=relative,
    )
    db_session.add(patient)
    await db_session.commit()
    await db_session.refresh(patient)
    return patient


# ── /media is gone ──────────────────────────────────────────────────────────


async def test_media_photo_not_served_without_login(
    client: AsyncClient, patient_with_photo: Patient
) -> None:
    resp = await client.get(f"/media/{patient_with_photo.photo_path}")

    assert resp.status_code == 404


async def test_media_card_pdf_not_served_without_login(client: AsyncClient, media_file) -> None:
    media_file(f"health_cards/{uuid.uuid4()}.pdf")
    card_pdfs = list((settings.MEDIA_DIR / "health_cards").glob("*.pdf"))
    assert card_pdfs  # guard: the file really exists on disk

    resp = await client.get(f"/media/health_cards/{card_pdfs[0].name}")

    assert resp.status_code == 404


# ── The authenticated photo endpoint ────────────────────────────────────────


async def test_photo_endpoint_requires_login(
    client: AsyncClient, patient_with_photo: Patient
) -> None:
    resp = await client.get(f"/api/v1/patients/{patient_with_photo.id}/photo")

    assert resp.status_code == 401


async def test_photo_endpoint_with_bearer_token(
    client: AsyncClient, patient_with_photo: Patient, bhw_token: str
) -> None:
    resp = await client.get(
        f"/api/v1/patients/{patient_with_photo.id}/photo",
        headers={"Authorization": f"Bearer {bhw_token}"},
    )

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/jpeg"
    assert resp.content == _JPEG_BYTES
    # Never cached by shared caches (proxies / CDN).
    assert "private" in resp.headers.get("cache-control", "")


async def test_photo_endpoint_with_cookie_like_a_browser_img(
    client: AsyncClient, patient_with_photo: Patient, make_user
) -> None:
    """An <img src> sends no Authorization header, only the httpOnly cookie."""
    user = await make_user("physician")
    client.cookies.set("access_token", create_access_token(subject=str(user.id), role="physician"))

    resp = await client.get(f"/api/v1/patients/{patient_with_photo.id}/photo")

    assert resp.status_code == 200
    assert resp.content == _JPEG_BYTES


# ── API responses point at the authenticated endpoint ──────────────────────


async def test_patient_response_photo_url_uses_authenticated_endpoint(
    client: AsyncClient, patient_with_photo: Patient, bhw_token: str
) -> None:
    resp = await client.get(
        f"/api/v1/patients/{patient_with_photo.id}",
        headers={"Authorization": f"Bearer {bhw_token}"},
    )

    assert resp.status_code == 200, resp.text
    photo = resp.json()["photo_path"]
    assert photo.startswith(f"/api/v1/patients/{patient_with_photo.id}/photo")
    assert "/media/" not in photo


# ── photo_api_url (DB-free) ─────────────────────────────────────────────────


def test_photo_api_url_none_without_photo() -> None:
    assert photo_api_url(uuid.uuid4(), None) is None
    assert photo_api_url(uuid.uuid4(), "") is None


def test_photo_api_url_versioned_by_file_time(media_file) -> None:
    patient_id = uuid.uuid4()
    path = media_file(f"patient_photos/{patient_id}.jpg")

    url = photo_api_url(patient_id, f"patient_photos/{patient_id}.jpg")

    assert url == f"/api/v1/patients/{patient_id}/photo?v={int(path.stat().st_mtime)}"


def test_photo_api_url_missing_file_still_points_at_endpoint() -> None:
    patient_id = uuid.uuid4()

    url = photo_api_url(patient_id, f"patient_photos/{patient_id}.jpg")

    assert url == f"/api/v1/patients/{patient_id}/photo?v=0"
