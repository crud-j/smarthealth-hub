"""
GET /patients/intake-token/current: the walk-in pre-visit link to show.

The Registration QR page shows a QR code as soon as it opens. To avoid a new
one-time link on every page visit, it first asks for the signed-in staff
member's newest walk-in link that a patient can still use (no form submitted,
not used, at least an hour left, not tied to an appointment or a patient).
Only when there is none does it create one (POST /patients/intake-token).
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.intake_token import PatientIntakeToken
from app.models.patient import Patient
from app.models.user import User

pytestmark = pytest.mark.asyncio

CURRENT = "/api/v1/patients/intake-token/current"
CREATE = "/api/v1/patients/intake-token"


async def _signed_in(make_user, role: str = "bhw") -> tuple[User, dict[str, str]]:
    user = await make_user(role)
    token = create_access_token(subject=str(user.id), role=role)
    return user, {"Authorization": f"Bearer {token}"}


async def _token(db, created_by: uuid.UUID | None, **overrides) -> PatientIntakeToken:
    fields = {
        "id": uuid.uuid4(),
        "token": uuid.uuid4(),
        "created_by_id": created_by,
        "expires_at": datetime.now(UTC) + timedelta(hours=40),
    }
    fields.update(overrides)
    row = PatientIntakeToken(**fields)
    db.add(row)
    await db.commit()
    return row


async def test_nothing_to_show_yet(client: AsyncClient, make_user) -> None:
    _user, headers = await _signed_in(make_user)
    resp = await client.get(CURRENT, headers=headers)
    assert resp.status_code == 200
    assert resp.json() is None


async def test_shows_the_link_just_created(client: AsyncClient, make_user) -> None:
    _user, headers = await _signed_in(make_user)
    created = (await client.post(CREATE, headers=headers)).json()

    current = (await client.get(CURRENT, headers=headers)).json()

    assert current["token"] == created["token"]
    assert current["intake_url"] == created["intake_url"]
    assert current["intake_url"].endswith(f"/intake/{created['token']}")
    assert current["expires_at"] == created["expires_at"]


async def test_newest_usable_link_wins(client: AsyncClient, make_user, db_session) -> None:
    user, headers = await _signed_in(make_user)
    now = datetime.now(UTC)
    await _token(db_session, user.id, created_at=now - timedelta(hours=3))
    newest = await _token(db_session, user.id, created_at=now - timedelta(minutes=5))

    current = (await client.get(CURRENT, headers=headers)).json()

    assert current["token"] == str(newest.token)


async def test_reading_creates_nothing(client: AsyncClient, make_user, db_session) -> None:
    _user, headers = await _signed_in(make_user)
    before = (await db_session.execute(select(func.count(PatientIntakeToken.id)))).scalar_one()

    await client.get(CURRENT, headers=headers)
    await client.get(CURRENT, headers=headers)

    after = (await db_session.execute(select(func.count(PatientIntakeToken.id)))).scalar_one()
    assert after == before


async def test_skips_links_a_patient_cannot_use(client: AsyncClient, make_user, db_session) -> None:
    user, headers = await _signed_in(make_user)
    other = await make_user("bhw")
    now = datetime.now(UTC)
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"BHC-T-{uuid.uuid4().hex[:8].upper()}",
        first_name="Ana",
        last_name="Reyes",
        birth_date=date(1995, 1, 15),
        sex="female",
        address="Test address",
        is_active=True,
        created_by=user.id,
    )
    db_session.add(patient)
    await db_session.commit()
    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=patient.id,
        appointment_type="checkup",
        scheduled_at=now + timedelta(days=2),
        status="pending",
    )
    db_session.add(appt)
    await db_session.commit()

    # Each of these is newer than the usable one, and none may be shown.
    usable = await _token(db_session, user.id, created_at=now - timedelta(hours=5))
    later = now - timedelta(minutes=1)
    await _token(db_session, user.id, created_at=later, used_at=now)
    await _token(db_session, user.id, created_at=later, draft_data={"first_name": "Ana"})
    await _token(db_session, user.id, created_at=later, expires_at=now - timedelta(minutes=1))
    await _token(db_session, user.id, created_at=later, expires_at=now + timedelta(minutes=30))
    await _token(db_session, user.id, created_at=later, appointment_id=appt.id)
    await _token(db_session, user.id, created_at=later, patient_id=patient.id)
    await _token(db_session, other.id, created_at=later)  # someone else's counter

    current = (await client.get(CURRENT, headers=headers)).json()

    assert current["token"] == str(usable.token)


@pytest.mark.parametrize("role", ["bhw", "physician", "admin_staff", "admin"])
async def test_same_roles_as_creating_a_link(client: AsyncClient, make_user, role: str) -> None:
    _user, headers = await _signed_in(make_user, role)
    assert (await client.get(CURRENT, headers=headers)).status_code == 200


async def test_requires_sign_in(client: AsyncClient) -> None:
    assert (await client.get(CURRENT)).status_code == 401
