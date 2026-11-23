"""
The "you missed your appointment" SMS (Celery beat, 18:00 Manila).

``_mark_missed_appointments_async`` marks past pending/confirmed appointments
as missed, then texts each patient whose appointment was today.

Bugs this file pins down:

1. "Today" was the UTC date of ``scheduled_at``. The database runs on UTC, so
   a 7:30 AM Manila booking (23:30 UTC the day before) fell on yesterday and
   its patient never got the text, while a 7:30 AM booking *tomorrow* fell on
   today. The day is now the Manila calendar day.
2. Nothing stopped a second run on the same day (a manual run, a retry) from
   texting the same patients again. An appointment that already has a
   follow-up SMS (any status; a failed one is resent by staff) is skipped.

The clock is pinned to 18:00 Manila: with the real clock the UTC and Manila
dates differ before 8 AM Manila and the result would depend on when the
tests run.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.sms_log import SmsLog
from app.workers.reminder_scheduler import _mark_missed_appointments_async
from tests.conftest import unique_mobile

pytestmark = pytest.mark.asyncio

MANILA = ZoneInfo("Asia/Manila")
TODAY = date(2030, 3, 4)
JOB_TIME = datetime(2030, 3, 4, 18, 0, tzinfo=MANILA)  # 10:00 UTC, same date
FOLLOW_UP = "post_miss_followup"


class _JobClock(datetime):
    """``datetime`` whose ``now()`` is the 18:00 Manila job time."""

    @classmethod
    def now(cls, tz: Any = None) -> datetime:  # type: ignore[override]
        return JOB_TIME.astimezone(tz) if tz is not None else JOB_TIME.replace(tzinfo=None)


def _manila(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=MANILA)


async def _patient(db: AsyncSession) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"MF-{uuid.uuid4().hex[:8].upper()}",
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


async def _appointment(db: AsyncSession, when: datetime, status: str = "confirmed") -> Appointment:
    patient = await _patient(db)
    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=patient.id,
        appointment_type="consultation",
        scheduled_at=when,
        status=status,
    )
    db.add(appt)
    await db.commit()
    return appt


async def _follow_ups(db: AsyncSession, appointment_id: uuid.UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(SmsLog)
        .where(
            SmsLog.appointment_id == appointment_id,
            SmsLog.sms_metadata["trigger"].astext == FOLLOW_UP,
        )
    )
    return (await db.execute(stmt)).scalar_one()


async def _run_job() -> MagicMock:
    with (
        patch("app.workers.reminder_scheduler.datetime", _JobClock),
        patch("app.workers.reminder_scheduler.send_reminder_task") as task,
    ):
        task.apply_async = MagicMock()
        await _mark_missed_appointments_async()
    return task.apply_async


class TestManilaDay:
    async def test_early_morning_booking_today_gets_the_text(self, db_session):
        # 7:30 AM Manila on 4 March = 23:30 UTC on 3 March.
        appt = await _appointment(db_session, _manila(TODAY, 7, 30))

        await _run_job()

        await db_session.refresh(appt)
        assert appt.status == "missed"
        assert await _follow_ups(db_session, appt.id) == 1

    async def test_afternoon_booking_today_gets_the_text(self, db_session):
        appt = await _appointment(db_session, _manila(TODAY, 16, 0))

        await _run_job()

        assert await _follow_ups(db_session, appt.id) == 1

    async def test_yesterdays_missed_booking_is_not_texted_again(self, db_session):
        appt = await _appointment(db_session, _manila(TODAY - timedelta(days=1), 16, 0), "missed")

        await _run_job()

        assert await _follow_ups(db_session, appt.id) == 0

    async def test_tomorrow_early_morning_is_not_texted_today(self, db_session):
        # 7:30 AM Manila on 5 March = 23:30 UTC on 4 March (the UTC "today").
        # Marked missed by hand: the job itself never marks a future booking.
        appt = await _appointment(db_session, _manila(TODAY + timedelta(days=1), 7, 30), "missed")

        await _run_job()

        assert await _follow_ups(db_session, appt.id) == 0


class TestNoSecondText:
    async def test_running_twice_texts_once(self, db_session):
        appt = await _appointment(db_session, _manila(TODAY, 9, 0))

        first = await _run_job()
        second = await _run_job()

        assert await _follow_ups(db_session, appt.id) == 1
        assert first.call_count == 1
        assert second.call_count == 0

    async def test_failed_follow_up_is_not_sent_again_by_the_job(self, db_session):
        appt = await _appointment(db_session, _manila(TODAY, 9, 0), "missed")
        db_session.add(
            SmsLog(
                id=uuid.uuid4(),
                patient_id=appt.patient_id,
                appointment_id=appt.id,
                mobile_number=unique_mobile(),
                message="earlier follow-up",
                status="failed",
                sms_metadata={"trigger": FOLLOW_UP},
            )
        )
        await db_session.commit()

        sent = await _run_job()

        assert await _follow_ups(db_session, appt.id) == 1  # only the failed one
        assert sent.call_count == 0

    async def test_the_day_before_reminder_does_not_count(self, db_session):
        # The appointment reminder sent before the visit is a different SMS
        # for the same appointment; it must not block the follow-up.
        appt = await _appointment(db_session, _manila(TODAY, 10, 0))
        db_session.add(
            SmsLog(
                id=uuid.uuid4(),
                patient_id=appt.patient_id,
                appointment_id=appt.id,
                mobile_number=unique_mobile(),
                message="reminder",
                status="delivered",
                sms_metadata={"confirmation_token": "1234", "appointment_id": str(appt.id)},
                sent_at=datetime(2030, 3, 3, 10, 0, tzinfo=UTC),
            )
        )
        await db_session.commit()

        await _run_job()

        assert await _follow_ups(db_session, appt.id) == 1
