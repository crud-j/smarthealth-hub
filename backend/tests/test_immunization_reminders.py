"""
Immunization reminder dispatch: which doses get an SMS, and catching up.

The production VM is off at night and started by hand, so the daily 10:00
run is sometimes skipped (Celery Beat never re-runs a missed job). A dose
must still get its reminder at the next run: the job picks every scheduled
dose due from today up to today + lead days that has never had a reminder
queued / sent / delivered / replied, instead of only doses due on exactly
today + lead days.

"Today" is the Manila calendar date (next_due_date is a local date).
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import func, select

from app.core.config import settings
from app.core.security import hash_password
from app.models.immunization import Immunization
from app.models.patient import Patient
from app.models.sms_log import SmsLog
from app.models.user import Role, User
from app.workers.reminder_scheduler import _dispatch_immunization_reminders_async

TODAY = date(2026, 12, 1)
LEAD = settings.SMS_IMMUNIZATION_LEAD_DAYS  # 3; no admin override in tests


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def staff_id(db_session) -> uuid.UUID:
    role = Role(id=uuid.uuid4(), name="bhw", permissions={})
    db_session.add(role)
    await db_session.commit()
    user = User(
        id=uuid.uuid4(),
        full_name="Test BHW",
        email=f"bhw_{uuid.uuid4().hex[:6]}@test.local",
        mobile_number=f"+6391700{abs(uuid.uuid4().int) % 100000:05d}",
        password_hash=hash_password("testpass123!"),
        role_id=role.id,
        is_active=True,
        mfa_enabled=False,
    )
    db_session.add(user)
    await db_session.commit()
    return user.id


async def _patient(db_session, staff_id, **overrides) -> uuid.UUID:
    fields = {
        "id": uuid.uuid4(),
        "patient_code": f"BHC-2026-{uuid.uuid4().hex[:6].upper()}",
        "first_name": "Maria",
        "middle_name": "Santos",
        "last_name": "Dela Cruz",
        "birth_date": date(1990, 5, 15),
        "sex": "female",
        "address": "123 Barangay Street, Manila",
        "mobile_number": "+639171234567",
        "is_active": True,
        "created_by": staff_id,
    }
    fields.update(overrides)
    patient = Patient(**fields)
    db_session.add(patient)
    await db_session.commit()
    return patient.id


async def _dose(db_session, patient_id, due: date, status: str = "scheduled") -> uuid.UUID:
    dose = Immunization(
        id=uuid.uuid4(),
        patient_id=patient_id,
        vaccine_name="Hepatitis B",
        dose_number=2,
        next_due_date=due,
        status=status,
    )
    db_session.add(dose)
    await db_session.commit()
    return dose.id


async def _earlier_reminder(db_session, patient_id, dose_id, status: str, days_ago: int = 1):
    db_session.add(
        SmsLog(
            id=uuid.uuid4(),
            patient_id=patient_id,
            immunization_id=dose_id,
            mobile_number="+639171234567",
            message="earlier immunization reminder",
            status=status,
            created_at=datetime.combine(TODAY, datetime.min.time(), tzinfo=UTC)
            - timedelta(days=days_ago),
        )
    )
    await db_session.commit()


async def _run(today: date = TODAY) -> tuple[int, MagicMock]:
    with patch("app.workers.reminder_scheduler.send_reminder_task") as task:
        task.delay = MagicMock()
        count = await _dispatch_immunization_reminders_async(today=today)
    return count, task.delay


async def _reminders(db_session, dose_id) -> int:
    return (
        await db_session.execute(
            select(func.count()).select_from(SmsLog).where(SmsLog.immunization_id == dose_id)
        )
    ).scalar_one()


# ---------------------------------------------------------------------------
# Which due dates are picked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("days_ahead", [0, 1, LEAD - 1, LEAD])
async def test_dose_due_within_lead_days_is_reminded(db_session, staff_id, days_ahead):
    """Due today .. today + lead days: reminded (catches up a skipped run)."""
    patient_id = await _patient(db_session, staff_id)
    dose_id = await _dose(db_session, patient_id, TODAY + timedelta(days=days_ahead))

    count, delay = await _run()

    assert count == 1
    assert await _reminders(db_session, dose_id) == 1
    delay.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("days_ahead", [-1, LEAD + 1])
async def test_dose_outside_window_is_not_reminded(db_session, staff_id, days_ahead):
    """Overdue (yesterday) or further out than lead days: nothing yet."""
    patient_id = await _patient(db_session, staff_id)
    dose_id = await _dose(db_session, patient_id, TODAY + timedelta(days=days_ahead))

    count, _ = await _run()

    assert count == 0
    assert await _reminders(db_session, dose_id) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["completed", "missed", "cancelled"])
async def test_only_scheduled_doses_are_reminded(db_session, staff_id, status):
    patient_id = await _patient(db_session, staff_id)
    dose_id = await _dose(db_session, patient_id, TODAY + timedelta(days=LEAD), status=status)

    count, _ = await _run()

    assert count == 0
    assert await _reminders(db_session, dose_id) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides", [{"sms_opt_out": True}, {"mobile_number": None}], ids=["opted_out", "no_mobile"]
)
async def test_patient_without_sms_is_skipped(db_session, staff_id, overrides):
    patient_id = await _patient(db_session, staff_id, **overrides)
    dose_id = await _dose(db_session, patient_id, TODAY + timedelta(days=LEAD))

    count, _ = await _run()

    assert count == 0
    assert await _reminders(db_session, dose_id) == 0


# ---------------------------------------------------------------------------
# One reminder per dose
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["queued", "sent", "delivered", "replied"])
async def test_dose_reminded_on_an_earlier_day_is_not_sent_again(db_session, staff_id, status):
    """Widening the window must not text the same dose every day."""
    patient_id = await _patient(db_session, staff_id)
    dose_id = await _dose(db_session, patient_id, TODAY + timedelta(days=LEAD))
    await _earlier_reminder(db_session, patient_id, dose_id, status)

    count, _ = await _run()

    assert count == 0
    assert await _reminders(db_session, dose_id) == 1


@pytest.mark.asyncio
async def test_failed_reminder_is_tried_again(db_session, staff_id):
    """The gateway said 'failed' yesterday: try again at the next run."""
    patient_id = await _patient(db_session, staff_id)
    dose_id = await _dose(db_session, patient_id, TODAY + timedelta(days=1))
    await _earlier_reminder(db_session, patient_id, dose_id, "failed")

    count, _ = await _run()

    assert count == 1
    assert await _reminders(db_session, dose_id) == 2


@pytest.mark.asyncio
async def test_two_runs_on_the_same_day_send_once(db_session, staff_id):
    patient_id = await _patient(db_session, staff_id)
    dose_id = await _dose(db_session, patient_id, TODAY + timedelta(days=LEAD))

    first, _ = await _run()
    second, _ = await _run()

    assert (first, second) == (1, 0)
    assert await _reminders(db_session, dose_id) == 1


# ---------------------------------------------------------------------------
# "Today" is the Manila date
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("utc_now", "manila_date"),
    [
        (datetime(2026, 11, 21, 2, 0, tzinfo=UTC), date(2026, 11, 21)),  # 10:00 Manila
        (datetime(2026, 11, 21, 15, 59, tzinfo=UTC), date(2026, 11, 21)),  # 23:59 Manila
        (datetime(2026, 11, 21, 16, 0, tzinfo=UTC), date(2026, 11, 22)),  # 00:00 Manila
    ],
)
def test_today_is_the_manila_date(utc_now, manila_date):
    from app.workers.reminder_scheduler import manila_today

    assert manila_today(utc_now) == manila_date
