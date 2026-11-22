"""
Appointment times are Manila times, whatever clock the server runs on.

Bug this file pins down: the booking page sends the time without a timezone
("2026-11-22T21:00:00"). The database driver reads such a value in the
server's own timezone. The PC runs on Manila time, so it looked right there;
the production backend container runs on UTC, so every booking was saved
8 hours late (9:00 PM became 5:00 AM the next day). Add Visit then found no
appointment "today", reminders went out 8 hours late, and the "must be in
the future" check compared Manila wall time with UTC wall time.

Separately, SMS texts printed the stored time in UTC (01:00 AM for a 9:00 AM
appointment) instead of Manila time.

Run these as the server does with ``TZ=UTC0`` (CI runs on UTC too).
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.sms_log import SmsLog
from app.services.sms_service import SMSService
from app.workers.reminder_scheduler import _dispatch_appointment_reminders_async
from tests.conftest import unique_mobile

pytestmark = pytest.mark.asyncio

MANILA = ZoneInfo("Asia/Manila")


def _manila_now() -> datetime:
    return datetime.now(tz=UTC).astimezone(MANILA)


def _naive(day: date, hour: int, minute: int = 0) -> str:
    """What the old booking page sends: no timezone at all."""
    return datetime.combine(day, time(hour, minute)).isoformat()


async def _headers(make_user: Any, role: str = "bhw") -> dict[str, str]:
    user = await make_user(role)
    token = create_access_token(subject=str(user.id), role=role)
    return {"Authorization": f"Bearer {token}"}


async def _patient(db: AsyncSession) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"TZ-{uuid.uuid4().hex[:8].upper()}",
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


async def _stored(db: AsyncSession, appointment_id: str) -> datetime:
    db.expire_all()
    row = await db.execute(
        select(Appointment.scheduled_at).where(Appointment.id == uuid.UUID(appointment_id))
    )
    return row.scalar_one()


# ---------------------------------------------------------------------------
# Booking and rescheduling
# ---------------------------------------------------------------------------


class TestBookingTimes:
    async def test_time_without_timezone_is_manila_time(
        self, client: AsyncClient, db_session, make_user
    ):
        tomorrow = _manila_now().date() + timedelta(days=1)
        resp = await _book(
            client, await _headers(make_user), await _patient(db_session), _naive(tomorrow, 21)
        )
        assert resp.status_code == 201, resp.text

        expected = datetime.combine(tomorrow, time(21, 0), tzinfo=MANILA)
        assert datetime.fromisoformat(resp.json()["scheduled_at"]) == expected
        assert await _stored(db_session, resp.json()["id"]) == expected

    @pytest.mark.parametrize("suffix", ["+08:00", "Z"])
    async def test_explicit_timezone_is_kept(
        self, client: AsyncClient, db_session, make_user, suffix
    ):
        tomorrow = _manila_now().date() + timedelta(days=1)
        when = _naive(tomorrow, 9) + suffix
        resp = await _book(client, await _headers(make_user), await _patient(db_session), when)
        assert resp.status_code == 201, resp.text
        expected = datetime.fromisoformat(when.replace("Z", "+00:00"))
        assert await _stored(db_session, resp.json()["id"]) == expected

    async def test_an_hour_ago_in_manila_is_in_the_past(
        self, client: AsyncClient, db_session, make_user
    ):
        """On a UTC server the old check let this through (Manila is 8 h ahead)."""
        an_hour_ago = (_manila_now() - timedelta(hours=1)).replace(tzinfo=None, microsecond=0)
        resp = await _book(
            client, await _headers(make_user), await _patient(db_session), an_hour_ago.isoformat()
        )
        assert resp.status_code == 422, resp.text

    async def test_reschedule_without_timezone_is_manila_time(
        self, client: AsyncClient, db_session, make_user
    ):
        headers = await _headers(make_user)
        patient = await _patient(db_session)
        day = _manila_now().date() + timedelta(days=2)
        resp = await _book(client, headers, patient, _naive(day, 9) + "+08:00")
        appointment_id = resp.json()["id"]

        resp = await client.put(
            f"/api/v1/appointments/{appointment_id}",
            json={"scheduled_at": _naive(day, 15)},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert await _stored(db_session, appointment_id) == datetime.combine(
            day, time(15, 0), tzinfo=MANILA
        )

    async def test_evening_booking_today_shows_up_in_add_visit(
        self, client: AsyncClient, db_session, make_user
    ):
        """The reported bug: book today 11:30 PM, then Add Visit found nothing."""
        now = _manila_now()
        if now.hour >= 23:
            pytest.skip("Too late in Manila to book a later time today.")
        headers = await _headers(make_user)
        patient = await _patient(db_session)
        resp = await _book(client, headers, patient, _naive(now.date(), 23, 30))
        assert resp.status_code == 201, resp.text

        prefill = await client.get(f"/api/v1/patients/{patient.id}/visits/prefill", headers=headers)
        assert prefill.status_code == 200, prefill.text
        assert prefill.json()["appointment_id"] == resp.json()["id"]
        assert prefill.json()["visit_type"] == "prenatal_checkup"


# ---------------------------------------------------------------------------
# SMS texts say the Manila time
# ---------------------------------------------------------------------------

NINE_AM_MANILA_IN_UTC = datetime(2026, 11, 23, 1, 0, tzinfo=UTC)


class TestSmsTimes:
    def test_reminder_text_uses_manila_time(self):
        text = SMSService().build_appointment_reminder(
            patient_name="Ana Reyes",
            appointment_type="prenatal",
            scheduled_at=NINE_AM_MANILA_IN_UTC,
        )
        assert "11/23/2026" in text
        assert "09:00 AM" in text

    async def test_booking_text_uses_manila_time(self, client: AsyncClient, db_session, make_user):
        patient = await _patient(db_session)
        tomorrow = _manila_now().date() + timedelta(days=1)
        nine_am = datetime.combine(tomorrow, time(9, 0), tzinfo=MANILA)
        when = nine_am.astimezone(UTC).isoformat().replace("+00:00", "Z")
        resp = await _book(client, await _headers(make_user), patient, when)
        assert resp.status_code == 201, resp.text

        rows = await db_session.execute(
            select(SmsLog.message).where(SmsLog.patient_id == patient.id)
        )
        messages = list(rows.scalars().all())
        assert messages, "booking should queue a reminder SMS"
        assert "09:00 AM" in messages[0]

    async def test_hourly_reminder_text_uses_manila_time(self, db_session):
        patient = await _patient(db_session)
        when = (datetime.now(tz=UTC) + timedelta(hours=24)).replace(second=0, microsecond=0)
        db_session.add(
            Appointment(
                id=uuid.uuid4(),
                patient_id=patient.id,
                appointment_type="prenatal",
                scheduled_at=when,
                status="pending",
            )
        )
        await db_session.commit()

        with patch("app.workers.reminder_scheduler.send_reminder_task") as task:
            task.delay = MagicMock()
            await _dispatch_appointment_reminders_async()

        rows = await db_session.execute(
            select(SmsLog.message).where(SmsLog.patient_id == patient.id)
        )
        message = rows.scalar_one()
        assert when.astimezone(MANILA).strftime("%I:%M %p") in message
        assert when.astimezone(MANILA).strftime("%m/%d/%Y") in message

    async def test_send_now_text_uses_manila_time(self, client: AsyncClient, db_session, make_user):
        patient = await _patient(db_session)
        appt = Appointment(
            id=uuid.uuid4(),
            patient_id=patient.id,
            appointment_type="prenatal",
            scheduled_at=NINE_AM_MANILA_IN_UTC,
            status="pending",
        )
        db_session.add(appt)
        await db_session.commit()

        send = AsyncMock()
        # The endpoint imports SMSService inside the function.
        with patch("app.services.sms_service.SMSService") as service:
            service.return_value.send_sms = send
            resp = await client.post(
                f"/api/v1/appointments/{appt.id}/send-reminder",
                headers=await _headers(make_user),
            )
        assert resp.status_code == 200, resp.text
        message = send.call_args.kwargs["message"]
        assert "November 23, 2026 at 09:00 AM" in message
