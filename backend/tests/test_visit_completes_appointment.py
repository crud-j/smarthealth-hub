"""
Logging a visit completes the patient's appointment on the same day.

"Completed" used to be only a manual button on the appointment page, and the
18:00 job marks every appointment still pending/confirmed as missed (and
texts the patient "you missed your appointment"). So a patient who came, but
whose appointment nobody clicked, was recorded as a no-show.

Now POST /patients/{id}/visits also sets that patient's appointments on the
visit's Manila calendar day to 'completed' when they are pending, confirmed
or missed (a visit logged after 18:00 corrects the record). Cancelled and
already-completed appointments are left alone. Each change writes an UPDATE
audit row on the appointment.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.audit_log import AuditLog
from app.models.patient import Patient

MANILA = ZoneInfo("Asia/Manila")
DAY = date(2026, 6, 10)


def _manila(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=MANILA)


async def _patient(db: AsyncSession) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"VC-{uuid.uuid4().hex[:8].upper()}",
        first_name="Vina",
        last_name="Test",
        birth_date=date(1990, 1, 1),
        sex="female",
        address="Barangay Test",
        is_active=True,
    )
    db.add(patient)
    await db.flush()
    return patient


async def _appointment(
    db: AsyncSession, patient: Patient, when: datetime, status: str
) -> Appointment:
    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=patient.id,
        appointment_type="general_checkup",
        scheduled_at=when,
        status=status,
    )
    db.add(appt)
    await db.flush()
    return appt


async def _log_visit(
    client: AsyncClient, make_user, patient: Patient, when: datetime | None, role: str = "bhw"
) -> tuple[dict, uuid.UUID]:
    user = await make_user(role)
    token = create_access_token(subject=str(user.id), role=role)
    payload: dict[str, object] = {"visit_type": "consultation", "vital_signs": {}}
    if when is not None:
        payload["visit_date"] = when.isoformat()
    resp = await client.post(
        f"/api/v1/patients/{patient.id}/visits",
        json=payload,
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "198.51.100.20"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json(), user.id


async def _status(db: AsyncSession, appt: Appointment) -> str:
    return (
        await db.execute(sa.select(Appointment.status).where(Appointment.id == appt.id))
    ).scalar_one()


async def test_pending_confirmed_and_missed_on_the_visit_day_become_completed(
    client: AsyncClient, make_user, db_session: AsyncSession
):
    patient = await _patient(db_session)
    pending = await _appointment(db_session, patient, _manila(DAY, 9), "pending")
    confirmed = await _appointment(db_session, patient, _manila(DAY, 14), "confirmed")
    missed = await _appointment(db_session, patient, _manila(DAY, 8), "missed")
    await db_session.commit()

    await _log_visit(client, make_user, patient, _manila(DAY, 10))

    assert await _status(db_session, pending) == "completed"
    assert await _status(db_session, confirmed) == "completed"
    assert await _status(db_session, missed) == "completed"


async def test_cancelled_and_completed_are_left_alone(
    client: AsyncClient, make_user, db_session: AsyncSession
):
    patient = await _patient(db_session)
    cancelled = await _appointment(db_session, patient, _manila(DAY, 9), "cancelled")
    done = await _appointment(db_session, patient, _manila(DAY, 8), "completed")
    await db_session.commit()

    await _log_visit(client, make_user, patient, _manila(DAY, 10))

    assert await _status(db_session, cancelled) == "cancelled"
    assert await _status(db_session, done) == "completed"
    audit = (
        await db_session.execute(
            sa.select(AuditLog).where(
                AuditLog.entity_type == "appointment",
                AuditLog.entity_id.in_([cancelled.id, done.id]),
            )
        )
    ).all()
    assert audit == []


async def test_only_the_same_manila_day_counts(
    client: AsyncClient, make_user, db_session: AsyncSession
):
    patient = await _patient(db_session)
    late_evening = await _appointment(db_session, patient, _manila(DAY, 23, 30), "pending")
    next_day = await _appointment(
        db_session, patient, _manila(DAY + timedelta(days=2), 9), "pending"
    )
    await db_session.commit()

    # 00:15 the next Manila day: a different day from the 23:30 appointment.
    await _log_visit(client, make_user, patient, _manila(DAY + timedelta(days=1), 0, 15))

    assert await _status(db_session, late_evening) == "pending"
    assert await _status(db_session, next_day) == "pending"


async def test_manila_day_not_utc_day(client: AsyncClient, make_user, db_session: AsyncSession):
    """07:00 Manila is 23:00 UTC the day before; it is still the visit's Manila day."""
    patient = await _patient(db_session)
    early = await _appointment(db_session, patient, _manila(DAY, 7), "pending")
    await db_session.commit()

    await _log_visit(client, make_user, patient, _manila(DAY, 10))

    assert await _status(db_session, early) == "completed"


async def test_another_patients_appointment_is_left_alone(
    client: AsyncClient, make_user, db_session: AsyncSession
):
    patient = await _patient(db_session)
    other = await _patient(db_session)
    theirs = await _appointment(db_session, other, _manila(DAY, 9), "pending")
    await db_session.commit()

    await _log_visit(client, make_user, patient, _manila(DAY, 10))

    assert await _status(db_session, theirs) == "pending"


async def test_each_change_is_audited(client: AsyncClient, make_user, db_session: AsyncSession):
    patient = await _patient(db_session)
    appt = await _appointment(db_session, patient, _manila(DAY, 9), "missed")
    await db_session.commit()

    visit, user_id = await _log_visit(
        client, make_user, patient, _manila(DAY, 10), role="physician"
    )

    rows = (
        (
            await db_session.execute(
                sa.select(AuditLog).where(
                    AuditLog.entity_type == "appointment", AuditLog.entity_id == appt.id
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    entry = rows[0]
    assert entry.action == "UPDATE"
    assert entry.user_id == user_id
    assert entry.ip_address == "198.51.100.20"
    assert entry.metadata_ == {
        "changed_fields": {"status": "completed"},
        "previous_status": "missed",
        "trigger": "visit_logged",
        "visit_id": visit["id"],
    }


async def test_visit_without_a_date_uses_today(
    client: AsyncClient, make_user, db_session: AsyncSession
):
    """visit_date defaults to now on the server; today's appointment is completed."""
    patient = await _patient(db_session)
    now = datetime.now(tz=UTC)
    today = await _appointment(db_session, patient, now - timedelta(minutes=1), "pending")
    await db_session.commit()

    await _log_visit(client, make_user, patient, None)

    assert await _status(db_session, today) == "completed"


async def test_visit_with_no_appointment_is_logged_as_before(
    client: AsyncClient, make_user, db_session: AsyncSession
):
    patient = await _patient(db_session)
    await db_session.commit()

    visit, _ = await _log_visit(client, make_user, patient, _manila(DAY, 10))

    assert visit["patient_id"] == str(patient.id)
