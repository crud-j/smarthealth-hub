"""
Return rate after SMS reminders (analytics_service.get_reminder_effect).

Compares finished appointments that got a reminder SMS with those that did
not, and how many of each the patient came to.

Definitions (approved defaults):
  came        appointment status 'completed', OR the patient has a visit
              logged on the appointment's Manila calendar day. Completion is a
              manual button and the 18:00 job marks everything still open as
              'missed', so status alone under-counts patients who came.
  reminded    at least one SMS linked to the appointment with status sent /
              delivered / replied, created before the appointment time. Failed
              or still-queued texts and the after-miss follow-up don't count.
  population  appointments scheduled in the window and already in the past,
              with a known outcome (completed / missed, or a visit that day).
              Cancelled ones and ones still open (pending/confirmed, no visit)
              are left out.
  small group fewer than 10 appointments → no percentage ("not enough data").
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.sms_log import SmsLog
from app.models.visit import Visit
from app.services import analytics_service

MANILA = ZoneInfo("Asia/Manila")
NOW = datetime(2026, 6, 15, 12, 0, tzinfo=MANILA)  # Monday noon, Manila
WINDOW = {"from_date": date(2026, 5, 17), "to_date": date(2026, 6, 15)}
URL = "/api/v1/analytics/appointments/reminder-effect"


def _manila(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=MANILA)


D = date(2026, 6, 10)  # a day inside the window


async def _patient(db: AsyncSession) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"RE-{uuid.uuid4().hex[:8].upper()}",
        first_name="Rina",
        last_name="Test",
        birth_date=date(1990, 1, 1),
        sex="female",
        address="Barangay Test",
        mobile_number="+639170000002",
        is_active=True,
    )
    db.add(patient)
    await db.flush()
    return patient


async def _appointment(
    db: AsyncSession,
    when: datetime,
    status: str,
    *,
    patient: Patient | None = None,
) -> Appointment:
    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=(patient or await _patient(db)).id,
        appointment_type="general_checkup",
        scheduled_at=when,
        status=status,
    )
    db.add(appt)
    await db.flush()
    return appt


async def _sms(
    db: AsyncSession,
    appt: Appointment,
    status: str = "sent",
    *,
    created_at: datetime | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    db.add(
        SmsLog(
            id=uuid.uuid4(),
            patient_id=appt.patient_id,
            appointment_id=appt.id,
            mobile_number="+639170000002",
            message="Reminder",
            status=status,
            created_at=created_at or appt.scheduled_at - timedelta(hours=24),
            sms_metadata=metadata if metadata is not None else {"confirmation_token": "1234"},
        )
    )
    await db.flush()


async def _visit(db: AsyncSession, patient_id: uuid.UUID, when: datetime) -> None:
    db.add(
        Visit(
            id=uuid.uuid4(),
            patient_id=patient_id,
            visit_date=when,
            visit_type="consultation",
        )
    )
    await db.flush()


async def _effect(db: AsyncSession) -> dict[str, Any]:
    await db.commit()
    return await analytics_service.get_reminder_effect(db, now=NOW, **WINDOW)


async def _bulk(db: AsyncSession, *, reminded: int, came: int, not_reminded: int, nr_came: int):
    for i in range(reminded):
        a = await _appointment(db, _manila(D, 9), "completed" if i < came else "missed")
        await _sms(db, a)
    for i in range(not_reminded):
        await _appointment(db, _manila(D, 9), "completed" if i < nr_came else "missed")


# ---------------------------------------------------------------------------
# Who came
# ---------------------------------------------------------------------------


class TestCame:
    async def test_completed_counts_as_came_missed_does_not(self, db_session: AsyncSession):
        done = await _appointment(db_session, _manila(D, 9), "completed")
        await _sms(db_session, done)
        missed = await _appointment(db_session, _manila(D, 10), "missed")
        await _sms(db_session, missed)

        effect = await _effect(db_session)

        assert effect["with_reminder"]["total"] == 2
        assert effect["with_reminder"]["came"] == 1
        assert effect["without_reminder"]["total"] == 0

    async def test_visit_on_the_same_manila_day_counts_as_came(self, db_session: AsyncSession):
        """Marked missed at 18:00 but a visit was logged that day → the patient came."""
        appt = await _appointment(db_session, _manila(D, 8), "missed")
        await _visit(db_session, appt.patient_id, _manila(D, 23, 30))  # 15:30 UTC, same Manila day

        effect = await _effect(db_session)

        assert effect["without_reminder"] == {"total": 1, "came": 1, "came_pct": None}

    async def test_visit_on_another_day_does_not_count(self, db_session: AsyncSession):
        appt = await _appointment(db_session, _manila(D, 8), "missed")
        await _visit(db_session, appt.patient_id, _manila(D + timedelta(days=1), 0, 30))
        await _visit(db_session, appt.patient_id, _manila(D - timedelta(days=1), 23, 30))

        effect = await _effect(db_session)

        assert effect["without_reminder"]["came"] == 0

    async def test_another_patients_visit_does_not_count(self, db_session: AsyncSession):
        await _appointment(db_session, _manila(D, 8), "missed")
        other = await _patient(db_session)
        await _visit(db_session, other.id, _manila(D, 9))

        effect = await _effect(db_session)

        assert effect["without_reminder"]["came"] == 0


# ---------------------------------------------------------------------------
# Who was reminded
# ---------------------------------------------------------------------------


class TestReminded:
    async def test_sent_delivered_and_replied_count(self, db_session: AsyncSession):
        for status in ("sent", "delivered", "replied"):
            appt = await _appointment(db_session, _manila(D, 9), "completed")
            await _sms(db_session, appt, status)

        effect = await _effect(db_session)

        assert effect["with_reminder"]["total"] == 3
        assert effect["without_reminder"]["total"] == 0

    async def test_failed_or_queued_text_is_not_a_reminder(self, db_session: AsyncSession):
        for status in ("failed", "queued"):
            appt = await _appointment(db_session, _manila(D, 9), "missed")
            await _sms(db_session, appt, status)

        effect = await _effect(db_session)

        assert effect["with_reminder"]["total"] == 0
        assert effect["without_reminder"]["total"] == 2

    async def test_after_miss_follow_up_is_not_a_reminder(self, db_session: AsyncSession):
        appt = await _appointment(db_session, _manila(D, 9), "missed")
        await _sms(
            db_session,
            appt,
            "sent",
            created_at=_manila(D, 18),
            metadata={"trigger": "post_miss_followup"},
        )
        # Even if such a text were logged before the appointment time.
        early = await _appointment(db_session, _manila(D, 20), "missed")
        await _sms(
            db_session,
            early,
            "sent",
            created_at=_manila(D, 18),
            metadata={"trigger": "post_miss_followup"},
        )

        effect = await _effect(db_session)

        assert effect["with_reminder"]["total"] == 0
        assert effect["without_reminder"]["total"] == 2

    async def test_text_sent_after_the_appointment_time_is_not_a_reminder(
        self, db_session: AsyncSession
    ):
        appt = await _appointment(db_session, _manila(D, 9), "missed")
        await _sms(db_session, appt, "sent", created_at=_manila(D, 9, 30))

        effect = await _effect(db_session)

        assert effect["with_reminder"]["total"] == 0

    async def test_booking_text_without_metadata_counts(self, db_session: AsyncSession):
        """The text sent when the appointment is booked (no metadata) is a reminder too."""
        appt = await _appointment(db_session, _manila(D, 9), "completed")
        await _sms(db_session, appt, "sent", metadata={})
        appt2 = await _appointment(db_session, _manila(D, 9), "completed")
        db_session.add(
            SmsLog(
                id=uuid.uuid4(),
                patient_id=appt2.patient_id,
                appointment_id=appt2.id,
                mobile_number="+639170000002",
                message="Booked",
                status="sent",
                created_at=_manila(D - timedelta(days=3), 9),
                sms_metadata=None,
            )
        )

        effect = await _effect(db_session)

        assert effect["with_reminder"]["total"] == 2

    async def test_several_texts_count_the_appointment_once(self, db_session: AsyncSession):
        appt = await _appointment(db_session, _manila(D, 9), "completed")
        await _sms(db_session, appt, "sent", created_at=_manila(D - timedelta(days=3), 9))
        await _sms(db_session, appt, "replied")

        effect = await _effect(db_session)

        assert effect["with_reminder"]["total"] == 1
        assert effect["confirmed_by_reply"] == 1


# ---------------------------------------------------------------------------
# Which appointments
# ---------------------------------------------------------------------------


class TestPopulation:
    async def test_cancelled_and_still_open_are_left_out(self, db_session: AsyncSession):
        await _appointment(db_session, _manila(D, 9), "cancelled")
        await _appointment(db_session, _manila(D, 9), "pending")  # no visit: outcome unknown
        await _appointment(db_session, _manila(D, 9), "confirmed")

        effect = await _effect(db_session)

        assert effect["with_reminder"]["total"] == 0
        assert effect["without_reminder"]["total"] == 0

    async def test_open_appointment_with_a_visit_that_day_counts_as_came(
        self, db_session: AsyncSession
    ):
        appt = await _appointment(db_session, _manila(D, 9), "confirmed")
        await _visit(db_session, appt.patient_id, _manila(D, 10))

        effect = await _effect(db_session)

        assert effect["without_reminder"] == {"total": 1, "came": 1, "came_pct": None}

    async def test_future_and_out_of_window_are_left_out(self, db_session: AsyncSession):
        await _appointment(db_session, NOW + timedelta(hours=1), "completed")  # later today
        await _appointment(
            db_session, _manila(date(2026, 5, 16), 23, 59), "completed"
        )  # day before
        inside = await _appointment(db_session, _manila(date(2026, 5, 17), 0, 1), "completed")
        await _sms(db_session, inside)

        effect = await _effect(db_session)

        assert effect["with_reminder"]["total"] == 1
        assert effect["without_reminder"]["total"] == 0


# ---------------------------------------------------------------------------
# Percentages
# ---------------------------------------------------------------------------


class TestRates:
    async def test_small_groups_have_no_percentage(self, db_session: AsyncSession):
        await _bulk(db_session, reminded=9, came=8, not_reminded=3, nr_came=1)

        effect = await _effect(db_session)

        assert effect["with_reminder"] == {"total": 9, "came": 8, "came_pct": None}
        assert effect["without_reminder"] == {"total": 3, "came": 1, "came_pct": None}
        assert effect["difference_points"] is None
        assert effect["min_group_size"] == 10

    async def test_percentages_and_difference(self, db_session: AsyncSession):
        await _bulk(db_session, reminded=12, came=10, not_reminded=10, nr_came=6)

        effect = await _effect(db_session)

        assert effect["with_reminder"] == {"total": 12, "came": 10, "came_pct": 83.3}
        assert effect["without_reminder"] == {"total": 10, "came": 6, "came_pct": 60.0}
        assert effect["difference_points"] == 23.3

    async def test_window_is_echoed(self, db_session: AsyncSession):
        effect = await _effect(db_session)
        assert effect["from_date"] == WINDOW["from_date"]
        assert effect["to_date"] == WINDOW["to_date"]
        assert effect["confirmed_by_reply"] == 0


# ---------------------------------------------------------------------------
# HTTP + dashboards
# ---------------------------------------------------------------------------


class TestEndpoint:
    async def test_any_staff_role_may_read_it(self, client: AsyncClient, make_user):
        for role in ("admin", "bhw", "physician", "admin_staff"):
            user = await make_user(role)
            token = create_access_token(subject=str(user.id), role=role)
            resp = await client.get(
                URL, params={"days": 30}, headers={"Authorization": f"Bearer {token}"}
            )
            assert resp.status_code == 200, (role, resp.text)

    async def test_days_sets_the_window(self, client: AsyncClient, bhw_token: str):
        resp = await client.get(
            URL, params={"days": 90}, headers={"Authorization": f"Bearer {bhw_token}"}
        )
        assert resp.status_code == 200
        body = resp.json()
        span = date.fromisoformat(body["to_date"]) - date.fromisoformat(body["from_date"])
        assert span == timedelta(days=89)
        assert date.fromisoformat(body["to_date"]) == datetime.now(tz=MANILA).date()
        assert set(body) == {
            "from_date",
            "to_date",
            "with_reminder",
            "without_reminder",
            "difference_points",
            "confirmed_by_reply",
            "min_group_size",
        }

    async def test_defaults_to_30_days(self, client: AsyncClient, bhw_token: str):
        resp = await client.get(URL, headers={"Authorization": f"Bearer {bhw_token}"})
        body = resp.json()
        span = date.fromisoformat(body["to_date"]) - date.fromisoformat(body["from_date"])
        assert span == timedelta(days=29)

    async def test_bad_days_is_422(self, client: AsyncClient, bhw_token: str):
        for days in (0, 400):
            resp = await client.get(
                URL, params={"days": days}, headers={"Authorization": f"Bearer {bhw_token}"}
            )
            assert resp.status_code == 422

    async def test_needs_sign_in(self, client: AsyncClient):
        assert (await client.get(URL)).status_code == 401


class TestDashboards:
    async def _dashboard(self, client: AsyncClient, make_user, role: str) -> dict[str, Any]:
        user = await make_user(role)
        token = create_access_token(subject=str(user.id), role=role)
        resp = await client.get(
            "/api/v1/dashboard/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, resp.text
        return resp.json()

    async def test_bhw_and_admin_dashboards_include_the_last_30_days(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ):
        today = datetime.now(tz=MANILA).date()
        appt = await _appointment(db_session, _manila(today - timedelta(days=3), 9), "completed")
        await _sms(db_session, appt)
        await _appointment(db_session, _manila(today - timedelta(days=40), 9), "completed")
        await db_session.commit()

        for role in ("bhw", "admin"):
            effect = (await self._dashboard(client, make_user, role))["reminder_effect"]
            assert effect["with_reminder"] == {"total": 1, "came": 1, "came_pct": None}
            assert effect["without_reminder"]["total"] == 0
            span = date.fromisoformat(effect["to_date"]) - date.fromisoformat(effect["from_date"])
            assert span == timedelta(days=29)

    async def test_physician_and_front_desk_dashboards_do_not(self, client: AsyncClient, make_user):
        for role in ("physician", "admin_staff"):
            assert "reminder_effect" not in await self._dashboard(client, make_user, role)


def test_now_fixture_is_manila_noon():
    assert NOW.astimezone(UTC).hour == 4
