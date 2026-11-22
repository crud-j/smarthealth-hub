"""
Appointments only during clinic hours.

A booking was saved for 12:00 AM because "12:00" was picked while the time
picker was on AM. Appointments are now refused outside the clinic's hours
(default 7:00 AM to 5:00 PM, Manila time). An Admin can change the hours on
Settings; every change is audited. Changing only the status of an existing
appointment (confirm, cancel) is never blocked, so old bookings outside the
hours can still be cancelled.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.audit_log import AuditLog
from app.models.patient import Patient
from tests.conftest import unique_mobile

pytestmark = pytest.mark.asyncio

MANILA = ZoneInfo("Asia/Manila")
HOURS_URL = "/api/v1/appointments/clinic-hours"
SETTINGS_URL = "/api/v1/system/settings"


def _day() -> date:
    """A day safely in the future (any time on it is not 'in the past')."""
    return datetime.now(tz=UTC).astimezone(MANILA).date() + timedelta(days=3)


def _at(hour: int, minute: int = 0) -> str:
    return datetime.combine(_day(), time(hour, minute), tzinfo=MANILA).isoformat()


async def _headers(make_user: Any, role: str = "bhw") -> dict[str, str]:
    user = await make_user(role)
    token = create_access_token(subject=str(user.id), role=role)
    return {"Authorization": f"Bearer {token}"}


async def _patient(db: AsyncSession) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"CH-{uuid.uuid4().hex[:8].upper()}",
        first_name="Ana",
        last_name="Reyes",
        birth_date=date(1990, 1, 1),
        sex="female",
        address="Barangay Test",
        mobile_number=unique_mobile(),
        is_active=True,
    )
    db.add(patient)
    await db.commit()
    return patient


async def _book(client: AsyncClient, headers: dict[str, str], patient: Patient, when: str) -> Any:
    return await client.post(
        "/api/v1/appointments",
        json={"patient_id": str(patient.id), "appointment_type": "prenatal", "scheduled_at": when},
        headers=headers,
    )


def _message(resp: Any) -> str:
    body = resp.json()
    return str(body.get("error", {}).get("message") or body.get("detail"))


# ---------------------------------------------------------------------------
# Default hours
# ---------------------------------------------------------------------------


class TestDefaultHours:
    @pytest.mark.parametrize("role", ["bhw", "physician", "admin", "admin_staff"])
    async def test_staff_can_read_the_hours(self, client: AsyncClient, make_user, role):
        resp = await client.get(HOURS_URL, headers=await _headers(make_user, role))
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"open_time": "07:00", "close_time": "17:00"}

    @pytest.mark.parametrize(("hour", "minute"), [(7, 0), (10, 30), (16, 59)])
    async def test_inside_hours_is_booked(
        self, client: AsyncClient, db_session, make_user, hour, minute
    ):
        resp = await _book(
            client, await _headers(make_user), await _patient(db_session), _at(hour, minute)
        )
        assert resp.status_code == 201, resp.text

    @pytest.mark.parametrize(("hour", "minute"), [(0, 0), (6, 59), (17, 0), (21, 0)])
    async def test_outside_hours_is_refused(
        self, client: AsyncClient, db_session, make_user, hour, minute
    ):
        patient = await _patient(db_session)
        resp = await _book(client, await _headers(make_user), patient, _at(hour, minute))
        assert resp.status_code == 422, resp.text
        assert "7:00 AM" in _message(resp)
        assert "5:00 PM" in _message(resp)
        rows = await db_session.execute(
            select(Appointment.id).where(Appointment.patient_id == patient.id)
        )
        assert rows.first() is None

    async def test_hours_are_manila_hours(self, client: AsyncClient, db_session, make_user):
        """10:00 AM Manila sent as UTC (02:00Z) is inside the hours."""
        when = datetime.combine(_day(), time(2, 0), tzinfo=UTC).isoformat()
        resp = await _book(client, await _headers(make_user), await _patient(db_session), when)
        assert resp.status_code == 201, resp.text


# ---------------------------------------------------------------------------
# Rescheduling vs. status changes
# ---------------------------------------------------------------------------


class TestExistingAppointments:
    async def test_reschedule_outside_hours_is_refused(
        self, client: AsyncClient, db_session, make_user
    ):
        headers = await _headers(make_user)
        resp = await _book(client, headers, await _patient(db_session), _at(9))
        resp = await client.put(
            f"/api/v1/appointments/{resp.json()['id']}",
            json={"scheduled_at": _at(0)},
            headers=headers,
        )
        assert resp.status_code == 422, resp.text

    @pytest.mark.parametrize("status", ["cancelled", "confirmed"])
    async def test_old_booking_outside_hours_can_still_change_status(
        self, client: AsyncClient, db_session, make_user, status
    ):
        patient = await _patient(db_session)
        appt = Appointment(
            id=uuid.uuid4(),
            patient_id=patient.id,
            appointment_type="prenatal",
            scheduled_at=datetime.combine(_day(), time(0, 0), tzinfo=MANILA),
            status="pending",
        )
        db_session.add(appt)
        await db_session.commit()
        resp = await client.put(
            f"/api/v1/appointments/{appt.id}",
            json={"status": status},
            headers=await _headers(make_user),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == status


# ---------------------------------------------------------------------------
# Admin changes the hours on Settings
# ---------------------------------------------------------------------------


class TestAdminSetsHours:
    async def test_settings_show_the_hours_with_defaults(self, client: AsyncClient, make_user):
        resp = await client.get(SETTINGS_URL, headers=await _headers(make_user, "admin"))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["clinic_open_time"]["value"] == "07:00"
        assert body["clinic_open_time"]["default"] == "07:00"
        assert body["clinic_close_time"]["value"] == "17:00"

    async def test_new_hours_apply_to_bookings_and_are_audited(
        self, client: AsyncClient, db_session, make_user
    ):
        admin = await _headers(make_user, "admin")
        resp = await client.put(
            SETTINGS_URL,
            json={"clinic_open_time": "08:00", "clinic_close_time": "12:00"},
            headers=admin,
        )
        assert resp.status_code == 200, resp.text

        bhw = await _headers(make_user)
        assert (await client.get(HOURS_URL, headers=bhw)).json() == {
            "open_time": "08:00",
            "close_time": "12:00",
        }
        patient = await _patient(db_session)
        assert (await _book(client, bhw, patient, _at(7, 30))).status_code == 422
        assert (await _book(client, bhw, patient, _at(13))).status_code == 422
        refused = await _book(client, bhw, patient, _at(13))
        assert "8:00 AM" in _message(refused) and "12:00 PM" in _message(refused)
        assert (await _book(client, bhw, patient, _at(11, 30))).status_code == 201

        rows = await db_session.execute(
            select(AuditLog).where(
                AuditLog.entity_type == "system_settings", AuditLog.action == "UPDATE"
            )
        )
        changes = [row.metadata_["changes"] for row in rows.scalars().all()]
        assert any(
            c.get("clinic_open_time") == {"from": "07:00", "to": "08:00"}
            and c.get("clinic_close_time") == {"from": "17:00", "to": "12:00"}
            for c in changes
        )

    @pytest.mark.parametrize(
        "body",
        [
            {"clinic_open_time": "7am"},
            {"clinic_open_time": "25:00"},
            {"clinic_close_time": "17:5"},
        ],
    )
    async def test_bad_time_format_is_refused(self, client: AsyncClient, make_user, body):
        resp = await client.put(SETTINGS_URL, json=body, headers=await _headers(make_user, "admin"))
        assert resp.status_code == 422, resp.text

    @pytest.mark.parametrize(
        "body",
        [
            {"clinic_open_time": "18:00"},  # after the default close (17:00)
            {"clinic_open_time": "09:00", "clinic_close_time": "09:00"},
        ],
    )
    async def test_closing_must_be_after_opening(self, client: AsyncClient, make_user, body):
        admin = await _headers(make_user, "admin")
        resp = await client.put(SETTINGS_URL, json=body, headers=admin)
        assert resp.status_code == 422, resp.text
        assert "closing" in _message(resp).lower()
        # Nothing was saved.
        hours = (await client.get(HOURS_URL, headers=admin)).json()
        assert hours == {"open_time": "07:00", "close_time": "17:00"}

    async def test_only_admin_changes_the_hours(self, client: AsyncClient, make_user):
        resp = await client.put(
            SETTINGS_URL, json={"clinic_open_time": "06:00"}, headers=await _headers(make_user)
        )
        assert resp.status_code == 403, resp.text
