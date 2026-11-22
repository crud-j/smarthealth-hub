"""
Archived patients are out of daily work, like deactivated ones.

Archived patients take no new visits (#66) and are hidden from the Patients
page, but their earlier appointments stayed on the dashboards with a
"Start visit" button that led to a "No new visits" notice.

  - Dashboards treat a patient as active only if not deactivated AND not
    archived (today's appointments, doses due, missed appointments, counts).
  - Appointment responses carry ``patient_not_in_use_reason`` (the same text
    as the 409 for new records) so the Appointments page and the appointment
    page can hide "Start visit" for removed patients.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.immunization import Immunization
from app.models.patient import Patient
from app.models.user import User
from app.services.patient_service import ARCHIVED_PATIENT_MESSAGE, INACTIVE_PATIENT_MESSAGE

pytestmark = pytest.mark.asyncio

MANILA = ZoneInfo("Asia/Manila")
DASHBOARD = "/api/v1/dashboard/me"
APPOINTMENTS = "/api/v1/appointments"


def _today() -> date:
    return datetime.now(tz=MANILA).date()


def _at(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=MANILA)


async def _signed_in(make_user, role: str) -> tuple[User, dict[str, str]]:
    user = await make_user(role)
    token = create_access_token(subject=str(user.id), role=role)
    return user, {"Authorization": f"Bearer {token}"}


async def _patient(db, created_by: uuid.UUID, first_name: str, **overrides) -> Patient:
    fields = {
        "id": uuid.uuid4(),
        "patient_code": f"BHC-T-{uuid.uuid4().hex[:8].upper()}",
        "first_name": first_name,
        "last_name": "Test",
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
        appointment_type="checkup",
        scheduled_at=when,
        status=kw.pop("status", "pending"),
        **kw,
    )
    db.add(appt)
    await db.commit()
    return appt


async def _three_patients(db, user: User) -> tuple[Patient, Patient, Patient]:
    in_use = await _patient(db, user.id, "Inuse")
    inactive = await _patient(db, user.id, "Paused", is_active=False)
    archived = await _patient(db, user.id, "Stored", archived_at=datetime.now(UTC))
    return in_use, inactive, archived


# ---------------------------------------------------------------------------
# Dashboards
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("role", ["bhw", "physician"])
async def test_todays_appointments_leave_out_removed_patients(
    client: AsyncClient, make_user, db_session, role: str
) -> None:
    user, headers = await _signed_in(make_user, role)
    today = _today()
    in_use, inactive, archived = await _three_patients(db_session, user)
    kept = await _appointment(db_session, in_use, _at(today, 9))
    await _appointment(db_session, inactive, _at(today, 10))
    await _appointment(db_session, archived, _at(today, 11))

    body = (await client.get(DASHBOARD, headers=headers)).json()

    assert body["appointments_today_count"] == 1
    assert [r["id"] for r in body["appointments_today"]] == [str(kept.id)]


async def test_bhw_work_lists_leave_out_archived_patients(
    client: AsyncClient, make_user, db_session
) -> None:
    bhw, headers = await _signed_in(make_user, "bhw")
    today = _today()
    in_use, _inactive, archived = await _three_patients(db_session, bhw)
    for p in (in_use, archived):
        db_session.add(
            Immunization(
                id=uuid.uuid4(),
                patient_id=p.id,
                vaccine_name="Pentavalent",
                dose_number=2,
                next_due_date=today + timedelta(days=2),
                status="scheduled",
            )
        )
        await _appointment(db_session, p, _at(today - timedelta(days=1), 9), status="missed")
    await db_session.commit()

    body = (await client.get(DASHBOARD, headers=headers)).json()

    assert body["immunizations_due_7d"] == 1
    assert [r["patient"]["id"] for r in body["immunizations_due"]] == [str(in_use.id)]
    assert body["missed_appointments_7d"] == 1
    assert [r["patient"]["id"] for r in body["missed_appointments"]] == [str(in_use.id)]
    # Only the in-use patient counts as an active patient without a card.
    assert body["patients_without_active_card"] == 1


async def test_admin_active_patients_match_the_patients_page(
    client: AsyncClient, make_user, db_session
) -> None:
    admin, headers = await _signed_in(make_user, "admin")
    await _three_patients(db_session, admin)

    body = (await client.get(DASHBOARD, headers=headers)).json()
    listed = (
        await client.get("/api/v1/patients", headers=headers, params={"page_size": 100})
    ).json()

    assert body["active_patients"] == 1
    assert body["active_patients"] == listed["total"]


# ---------------------------------------------------------------------------
# Appointment responses say why a patient takes no new visits
# ---------------------------------------------------------------------------


async def test_appointments_say_why_a_patient_takes_no_new_visits(
    client: AsyncClient, make_user, db_session
) -> None:
    user, headers = await _signed_in(make_user, "physician")
    day = date(2030, 3, 4)
    in_use, inactive, archived = await _three_patients(db_session, user)
    ids = {
        (await _appointment(db_session, p, _at(day, 9))).id: p.first_name
        for p in (in_use, inactive, archived)
    }

    listed = (
        await client.get(
            APPOINTMENTS,
            headers=headers,
            params={"from_date": day.isoformat(), "to_date": day.isoformat()},
        )
    ).json()["items"]
    reasons = {ids[uuid.UUID(item["id"])]: item["patient_not_in_use_reason"] for item in listed}

    assert reasons == {
        "Inuse": None,
        "Paused": INACTIVE_PATIENT_MESSAGE,
        "Stored": ARCHIVED_PATIENT_MESSAGE,
    }

    archived_id = next(i for i, name in ids.items() if name == "Stored")
    detail = (await client.get(f"{APPOINTMENTS}/{archived_id}", headers=headers)).json()
    assert detail["patient_not_in_use_reason"] == ARCHIVED_PATIENT_MESSAGE
