"""
"Start visit" from today's appointments.

  - The BHW dashboard lists today's appointments (like the Physician's), so
    the BHW can open Add Visit straight from the row.
  - The Appointments page date filter (``from_date`` / ``to_date``) uses the
    Manila calendar day. The database runs on UTC, so a 7:30 AM Manila booking
    is 11:30 PM UTC the day before and used to be left out of "today".
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.user import User

pytestmark = pytest.mark.asyncio

MANILA = ZoneInfo("Asia/Manila")
DASHBOARD = "/api/v1/dashboard/me"
APPOINTMENTS = "/api/v1/appointments"

# A fixed day, so the date-filter tests do not depend on the time they run.
DAY = date(2030, 3, 4)


def _at(day: date, hour: int, minute: int = 0) -> datetime:
    """Manila wall-clock time on ``day``, as an aware datetime."""
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=MANILA)


async def _signed_in(make_user, role: str) -> tuple[User, dict[str, str]]:
    user = await make_user(role)
    token = create_access_token(subject=str(user.id), role=role)
    return user, {"Authorization": f"Bearer {token}"}


async def _patient(db, created_by: uuid.UUID, **overrides) -> Patient:
    fields = {
        "id": uuid.uuid4(),
        "patient_code": f"BHC-T-{uuid.uuid4().hex[:8].upper()}",
        "first_name": "Ana",
        "last_name": "Reyes",
        "birth_date": date(1995, 1, 15),
        "sex": "female",
        "address": "Test address",
        "mobile_number": "+639170000001",
        "is_active": True,
        "created_by": created_by,
    }
    fields.update(overrides)
    patient = Patient(**fields)
    db.add(patient)
    await db.commit()
    return patient


async def _appointment(db, patient: Patient, when: datetime, **kw) -> Appointment:
    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=patient.id,
        appointment_type=kw.pop("appointment_type", "checkup"),
        scheduled_at=when,
        status=kw.pop("status", "pending"),
        **kw,
    )
    db.add(appt)
    await db.commit()
    return appt


# ---------------------------------------------------------------------------
# BHW dashboard: today's appointments with the patient
# ---------------------------------------------------------------------------


async def test_bhw_dashboard_lists_todays_appointments(
    client: AsyncClient, make_user, db_session
) -> None:
    bhw, headers = await _signed_in(make_user, "bhw")
    today = datetime.now(tz=MANILA).date()
    ana = await _patient(db_session, bhw.id, first_name="Ana", last_name="Reyes")
    bea = await _patient(db_session, bhw.id, first_name="Bea", last_name="Santos")
    gone = await _patient(db_session, bhw.id, is_active=False)

    late = await _appointment(db_session, ana, _at(today, 15), appointment_type="prenatal")
    early = await _appointment(db_session, bea, _at(today, 7, 30), status="confirmed")
    done = await _appointment(db_session, bea, _at(today, 9), status="completed")
    await _appointment(db_session, ana, _at(today, 10), status="cancelled")
    await _appointment(db_session, ana, _at(today + timedelta(days=1), 9))
    await _appointment(db_session, ana, _at(today - timedelta(days=1), 9))
    await _appointment(db_session, gone, _at(today, 11))

    body = (await client.get(DASHBOARD, headers=headers)).json()

    assert body["appointments_today_count"] == 3
    rows = body["appointments_today"]
    assert [r["id"] for r in rows] == [str(early.id), str(done.id), str(late.id)]
    assert rows[0]["patient"] == {
        "id": str(bea.id),
        "patient_code": bea.patient_code,
        "full_name": "Bea Santos",
    }
    assert rows[0]["status"] == "confirmed"
    assert rows[1]["status"] == "completed"  # shown, but no Start visit (UI)
    assert rows[2]["appointment_type"] == "prenatal"


async def test_bhw_dashboard_today_list_is_capped_but_count_is_not(
    client: AsyncClient, make_user, db_session
) -> None:
    bhw, headers = await _signed_in(make_user, "bhw")
    today = datetime.now(tz=MANILA).date()
    p = await _patient(db_session, bhw.id)
    for i in range(12):
        await _appointment(db_session, p, _at(today, 8, i))

    body = (await client.get(DASHBOARD, headers=headers)).json()

    assert body["appointments_today_count"] == 12
    assert len(body["appointments_today"]) == 10


# ---------------------------------------------------------------------------
# Appointments list: from_date / to_date are Manila days
# ---------------------------------------------------------------------------


async def _listed(client: AsyncClient, headers: dict[str, str], **params: str) -> set[str]:
    resp = await client.get(APPOINTMENTS, headers=headers, params={"page_size": "100", **params})
    assert resp.status_code == 200, resp.text
    return {item["id"] for item in resp.json()["items"]}


async def test_date_filter_counts_early_morning_as_the_manila_day(
    client: AsyncClient, make_user, db_session
) -> None:
    bhw, headers = await _signed_in(make_user, "bhw")
    p = await _patient(db_session, bhw.id)
    # 7:30 AM Manila = 11:30 PM UTC the day before.
    opening = await _appointment(db_session, p, _at(DAY, 7, 30))
    afternoon = await _appointment(db_session, p, _at(DAY, 16, 59))
    next_morning = await _appointment(db_session, p, _at(DAY + timedelta(days=1), 7, 30))
    day_before = await _appointment(db_session, p, _at(DAY - timedelta(days=1), 16))

    one_day = await _listed(client, headers, from_date=DAY.isoformat(), to_date=DAY.isoformat())

    assert one_day == {str(opening.id), str(afternoon.id)}
    assert str(next_morning.id) not in one_day
    assert str(day_before.id) not in one_day


async def test_date_filter_bounds_work_alone(client: AsyncClient, make_user, db_session) -> None:
    bhw, headers = await _signed_in(make_user, "bhw")
    p = await _patient(db_session, bhw.id)
    day_before = await _appointment(db_session, p, _at(DAY - timedelta(days=1), 16))
    opening = await _appointment(db_session, p, _at(DAY, 7, 30))
    next_morning = await _appointment(db_session, p, _at(DAY + timedelta(days=1), 7, 30))

    from_day = await _listed(client, headers, from_date=DAY.isoformat())
    until_day = await _listed(client, headers, to_date=DAY.isoformat())

    assert str(opening.id) in from_day
    assert str(next_morning.id) in from_day
    assert str(day_before.id) not in from_day
    assert str(opening.id) in until_day
    assert str(day_before.id) in until_day
    assert str(next_morning.id) not in until_day
