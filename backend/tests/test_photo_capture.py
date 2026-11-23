"""
Take the patient photo with a phone: QR link from the staff screen.

Staff open a patient's photo panel (registration step 4 or the profile) on a
PC that usually has no webcam. The panel shows a QR code; staff scan it with
a phone, take the photo, and it appears on the PC.

  POST /patients/{id}/photo-capture          staff (BHW+): make a link (15 min)
  GET  /patients/{id}/photo-capture/{token}  staff: has a photo arrived? (polled)
  GET  /photo-capture/{token}                public (the phone): initials + expiry
  POST /photo-capture/{token}                public (the phone): upload the photo

The link is a random token kept in Redis (no PHI in the QR, nothing in the
database). It can only upload a photo for that one patient; it cannot read the
photo or the record. The phone page shows only the patient's initials so staff
can check they have the right patient. Each upload is audited as an UPDATE of
the patient by the staff member who made the link.

Also: the government-ID scan (POST /patients/ocr-extract) was removed.
"""

from __future__ import annotations

import io
import uuid
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, get_shared_redis
from app.models.audit_log import AuditLog
from app.models.patient import Patient
from app.models.user import User

pytestmark = pytest.mark.asyncio


def _staff_link(patient_id: uuid.UUID) -> str:
    return f"/api/v1/patients/{patient_id}/photo-capture"


def _phone(token: str) -> str:
    return f"/api/v1/photo-capture/{token}"


def _jpeg(color: str = "red") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), color).save(buf, format="JPEG")
    return buf.getvalue()


async def _signed_in(make_user, role: str = "bhw") -> tuple[User, dict[str, str]]:
    user = await make_user(role)
    token = create_access_token(subject=str(user.id), role=role)
    return user, {"Authorization": f"Bearer {token}"}


@pytest.fixture
def cleanup_photos() -> Iterator[list[uuid.UUID]]:
    """Patient ids whose saved photo file is deleted after the test."""
    ids: list[uuid.UUID] = []
    yield ids
    for patient_id in ids:
        (settings.MEDIA_DIR / "patient_photos" / f"{patient_id}.jpg").unlink(missing_ok=True)


@pytest_asyncio.fixture
async def patient(db_session: AsyncSession, cleanup_photos: list[uuid.UUID]) -> Patient:
    row = Patient(
        id=uuid.uuid4(),
        patient_code=f"BHC-2030-{uuid.uuid4().hex[:6].upper()}",
        first_name="Ana",
        last_name="Reyes",
        birth_date=date(1990, 1, 1),
        sex="female",
        address="Barangay Test",
        is_active=True,
    )
    db_session.add(row)
    await db_session.commit()
    cleanup_photos.append(row.id)
    return row


async def _make_link(client: AsyncClient, headers: dict[str, str], patient_id: uuid.UUID) -> dict:
    resp = await client.post(_staff_link(patient_id), headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _upload(
    client: AsyncClient, token: str, data: bytes | None = None, ctype: str = "image/jpeg"
):
    return await client.post(_phone(token), files={"photo": ("phone.jpg", data or _jpeg(), ctype)})


# ---------------------------------------------------------------------------
# Making the link
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("role", ["bhw", "physician", "admin_staff", "admin"])
async def test_staff_make_a_link(
    client: AsyncClient, make_user, patient: Patient, role: str
) -> None:
    _user, headers = await _signed_in(make_user, role)

    body = await _make_link(client, headers, patient.id)

    token = body["token"]
    assert len(token) >= 32
    assert body["capture_url"] == f"{settings.QR_BASE_URL}/photo-capture/{token}"
    expires = datetime.fromisoformat(body["expires_at"])
    left = expires - datetime.now(UTC)
    assert timedelta(minutes=14) < left <= timedelta(minutes=15)


async def test_link_needs_sign_in(client: AsyncClient, patient: Patient) -> None:
    resp = await client.post(_staff_link(patient.id))
    assert resp.status_code == 401


async def test_unknown_patient(client: AsyncClient, make_user) -> None:
    _user, headers = await _signed_in(make_user)
    resp = await client.post(_staff_link(uuid.uuid4()), headers=headers)
    assert resp.status_code == 404


async def test_the_link_holds_no_patient_details(
    client: AsyncClient, make_user, patient: Patient
) -> None:
    user, headers = await _signed_in(make_user)
    token = (await _make_link(client, headers, patient.id))["token"]

    stored = await get_shared_redis().get(f"photo_capture:{token}")
    assert stored is not None
    text = stored.decode() if isinstance(stored, bytes) else stored
    assert str(patient.id) in text and str(user.id) in text
    for detail in ("Ana", "Reyes", patient.patient_code, "1990"):
        assert detail not in text
    ttl = await get_shared_redis().ttl(f"photo_capture:{token}")
    assert 14 * 60 < ttl <= 15 * 60


# ---------------------------------------------------------------------------
# The phone page
# ---------------------------------------------------------------------------


async def test_phone_sees_only_initials(client: AsyncClient, make_user, patient: Patient) -> None:
    _user, headers = await _signed_in(make_user)
    link = await _make_link(client, headers, patient.id)

    resp = await client.get(_phone(link["token"]))  # no sign-in

    assert resp.status_code == 200
    body = resp.json()
    assert body["patient_initials"] == "A. R."
    assert body["expires_at"] == link["expires_at"]
    assert body["uploaded_at"] is None
    assert set(body) == {"patient_initials", "expires_at", "uploaded_at"}


async def test_unknown_or_expired_link(client: AsyncClient, make_user, patient: Patient) -> None:
    _user, headers = await _signed_in(make_user)
    token = (await _make_link(client, headers, patient.id))["token"]
    await get_shared_redis().delete(f"photo_capture:{token}")  # what expiry does

    assert (await client.get(_phone(token))).status_code == 404
    assert (await _upload(client, token)).status_code == 404
    assert (await client.get(_phone("not-a-real-token-at-all"))).status_code == 404


async def test_phone_upload_saves_the_photo_and_audits_it(
    client: AsyncClient, make_user, patient: Patient, db_session: AsyncSession
) -> None:
    user, headers = await _signed_in(make_user)
    token = (await _make_link(client, headers, patient.id))["token"]

    resp = await _upload(client, token)

    assert resp.status_code == 200, resp.text
    assert resp.json()["uploaded_at"]
    assert "photo_url" not in resp.json()  # the phone cannot read the photo back

    await db_session.refresh(patient)
    assert patient.photo_path == f"patient_photos/{patient.id}.jpg"
    assert (settings.MEDIA_DIR / patient.photo_path).exists()

    audit = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.entity_id == patient.id, AuditLog.action == "UPDATE"
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(audit) == 1
    assert audit[0].user_id == user.id
    assert audit[0].entity_type == "patient"
    assert audit[0].metadata_["changed_fields"] == ["photo_path"]
    assert audit[0].metadata_["source"] == "phone_capture"


async def test_staff_screen_sees_the_new_photo(
    client: AsyncClient, make_user, patient: Patient
) -> None:
    _user, headers = await _signed_in(make_user)
    token = (await _make_link(client, headers, patient.id))["token"]
    status_url = f"{_staff_link(patient.id)}/{token}"

    before = (await client.get(status_url, headers=headers)).json()
    assert before["uploaded_at"] is None and before["photo_url"] is None

    await _upload(client, token)

    after = (await client.get(status_url, headers=headers)).json()
    assert after["uploaded_at"]
    assert after["photo_url"].startswith(f"/api/v1/patients/{patient.id}/photo?v=")
    # The phone page now says it was sent.
    assert (await client.get(_phone(token))).json()["uploaded_at"] == after["uploaded_at"]


async def test_status_needs_sign_in_and_the_right_patient(
    client: AsyncClient, make_user, patient: Patient, db_session: AsyncSession
) -> None:
    _user, headers = await _signed_in(make_user)
    token = (await _make_link(client, headers, patient.id))["token"]

    assert (await client.get(f"{_staff_link(patient.id)}/{token}")).status_code == 401
    other = uuid.uuid4()
    assert (await client.get(f"{_staff_link(other)}/{token}", headers=headers)).status_code == 404


async def test_retake_replaces_the_photo(client: AsyncClient, make_user, patient: Patient) -> None:
    _user, headers = await _signed_in(make_user)
    token = (await _make_link(client, headers, patient.id))["token"]

    assert (await _upload(client, token, _jpeg("red"))).status_code == 200
    assert (await _upload(client, token, _jpeg("blue"))).status_code == 200

    saved = Image.open(settings.MEDIA_DIR / "patient_photos" / f"{patient.id}.jpg")
    red, green, blue = saved.convert("RGB").getpixel((20, 15))
    assert blue > red  # the second photo is the one on file


async def test_not_an_image(client: AsyncClient, make_user, patient: Patient) -> None:
    _user, headers = await _signed_in(make_user)
    token = (await _make_link(client, headers, patient.id))["token"]

    resp = await _upload(client, token, b"%PDF-1.4 not a photo", "application/pdf")

    assert resp.status_code == 422


async def test_phone_uploads_are_rate_limited(
    client: AsyncClient, make_user, patient: Patient
) -> None:
    _user, headers = await _signed_in(make_user)
    token = (await _make_link(client, headers, patient.id))["token"]
    tiny = _jpeg()

    codes = [(await _upload(client, token, tiny)).status_code for _ in range(11)]

    assert codes[:10] == [200] * 10
    assert codes[10] == 429


# ---------------------------------------------------------------------------
# Government-ID scan removed
# ---------------------------------------------------------------------------


async def test_id_scan_endpoint_is_gone(client: AsyncClient, make_user) -> None:
    _user, headers = await _signed_in(make_user)
    resp = await client.post(
        "/api/v1/patients/ocr-extract",
        headers=headers,
        files={"image": ("id.jpg", _jpeg(), "image/jpeg")},
    )
    assert resp.status_code in (404, 405)
