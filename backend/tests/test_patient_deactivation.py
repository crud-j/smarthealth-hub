"""
Deactivated and archived patients: never texted, never deleted, always restorable.

Two different ways to take a patient out of daily work:

- **Deactivate** (``is_active = False``): the record is switched off for now.
  It disappears from the patient list and search, gets no SMS, and can be
  switched back on (Reactivate) from the Inactive Patients page. When, who and
  why are kept on the row; the audit log gets DEACTIVATE / REACTIVATE.
- **Archive** (``archived_at`` set): an old record stored away from the active
  list; restored from the Patient Archive. Also gets no SMS.

Nothing is deleted in either case: the patient row and all its records stay.

Bug this file pins down: the three SMS jobs (appointment reminders,
immunization reminders, the "you missed your appointment" text) only checked
the mobile number and the opt-out flag, so deactivated and archived patients
kept receiving texts.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.audit_log import AuditLog
from app.models.immunization import Immunization
from app.models.patient import Patient
from app.models.sms_log import SmsLog
from app.models.user import User
from app.services import audit_anomaly_service
from app.services.sms_resend_service import resend_problem
from app.utils.manila_time import MANILA
from app.workers.reminder_scheduler import (
    _dispatch_appointment_reminders_async,
    _dispatch_immunization_reminders_async,
    _mark_missed_appointments_async,
    manila_today,
)
from tests.conftest import unique_mobile

pytestmark = pytest.mark.asyncio

REASON = "Test record made while trying the allergy banner"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _user(make_user: Any, role: str) -> tuple[User, dict[str, str]]:
    user: User = await make_user(role)
    token = create_access_token(subject=str(user.id), role=role)
    return user, {"Authorization": f"Bearer {token}"}


async def _patient(db: AsyncSession, **overrides: Any) -> Patient:
    fields: dict[str, Any] = {
        "id": uuid.uuid4(),
        "patient_code": f"DA-{uuid.uuid4().hex[:8].upper()}",
        "first_name": "Dina",
        "last_name": "Activa",
        "birth_date": date(1990, 1, 1),
        "sex": "female",
        "address": "Barangay Test",
        "mobile_number": unique_mobile(),
        "is_active": True,
    }
    fields.update(overrides)
    patient = Patient(**fields)
    db.add(patient)
    await db.commit()
    await db.refresh(patient)
    return patient


def _removed(kind: str) -> dict[str, Any]:
    """Overrides that take a patient out of daily work, one way or the other."""
    if kind == "inactive":
        return {"is_active": False}
    return {"archived_at": datetime.now(tz=UTC), "archive_reason": "Moved away"}


async def _sms_count(db: AsyncSession, **where: Any) -> int:
    stmt = select(func.count()).select_from(SmsLog)
    for column, value in where.items():
        stmt = stmt.where(getattr(SmsLog, column) == value)
    return (await db.execute(stmt)).scalar_one()


async def _audit_rows(db: AsyncSession, patient_id: uuid.UUID, action: str) -> list[AuditLog]:
    rows = await db.execute(
        select(AuditLog).where(AuditLog.entity_id == patient_id, AuditLog.action == action)
    )
    return list(rows.scalars().all())


REMOVED = pytest.mark.parametrize("kind", ["inactive", "archived"])


# ---------------------------------------------------------------------------
# SMS jobs skip deactivated and archived patients
# ---------------------------------------------------------------------------


class TestRemindersSkipRemovedPatients:
    async def _appointment(self, db: AsyncSession, patient: Patient, when: datetime) -> Appointment:
        appt = Appointment(
            id=uuid.uuid4(),
            patient_id=patient.id,
            appointment_type="consultation",
            scheduled_at=when,
            status="pending",
        )
        db.add(appt)
        await db.commit()
        return appt

    async def test_active_patient_still_gets_an_appointment_reminder(self, db_session):
        patient = await _patient(db_session)
        appt = await self._appointment(
            db_session, patient, datetime.now(tz=UTC) + timedelta(hours=24)
        )
        with patch("app.workers.reminder_scheduler.send_reminder_task") as task:
            task.delay = MagicMock()
            await _dispatch_appointment_reminders_async()
        assert await _sms_count(db_session, appointment_id=appt.id) == 1

    @REMOVED
    async def test_no_appointment_reminder(self, db_session, kind):
        patient = await _patient(db_session, **_removed(kind))
        appt = await self._appointment(
            db_session, patient, datetime.now(tz=UTC) + timedelta(hours=24)
        )
        with patch("app.workers.reminder_scheduler.send_reminder_task") as task:
            task.delay = MagicMock()
            await _dispatch_appointment_reminders_async()
        assert await _sms_count(db_session, appointment_id=appt.id) == 0

    @REMOVED
    async def test_no_immunization_reminder(self, db_session, kind):
        patient = await _patient(db_session, **_removed(kind))
        today = manila_today()
        dose = Immunization(
            id=uuid.uuid4(),
            patient_id=patient.id,
            vaccine_name="Hepatitis B",
            dose_number=2,
            next_due_date=today + timedelta(days=1),
            status="scheduled",
        )
        db_session.add(dose)
        await db_session.commit()

        with patch("app.workers.reminder_scheduler.send_reminder_task") as task:
            task.delay = MagicMock()
            await _dispatch_immunization_reminders_async(today=today)
        assert await _sms_count(db_session, immunization_id=dose.id) == 0

    @REMOVED
    async def test_no_missed_appointment_text_but_still_marked_missed(self, db_session, kind):
        patient = await _patient(db_session, **_removed(kind))
        now = datetime.now(tz=UTC)
        today = manila_today(now)
        start_of_manila_day = datetime(today.year, today.month, today.day, tzinfo=MANILA)
        appt = await self._appointment(
            db_session, patient, max(now - timedelta(minutes=1), start_of_manila_day)
        )

        with patch("app.workers.reminder_scheduler.send_reminder_task") as task:
            task.apply_async = MagicMock()
            await _mark_missed_appointments_async()

        await db_session.refresh(appt)
        assert appt.status == "missed"  # the record stays correct
        assert await _sms_count(db_session, appointment_id=appt.id) == 0

    async def test_resend_refuses_an_archived_patient(self, db_session):
        patient = await _patient(db_session, **_removed("archived"))
        failed = SmsLog(
            id=uuid.uuid4(),
            patient_id=patient.id,
            mobile_number=patient.mobile_number,
            message="Hi",
            status="failed",
        )
        db_session.add(failed)
        await db_session.commit()

        problem = await resend_problem(db_session, failed, resent=False)
        assert problem is not None
        assert "archive" in problem.lower()

    async def test_resend_says_an_inactive_patient_is_inactive(self, db_session):
        patient = await _patient(db_session, is_active=False)
        failed = SmsLog(
            id=uuid.uuid4(),
            patient_id=patient.id,
            mobile_number=patient.mobile_number,
            message="Hi",
            status="failed",
        )
        db_session.add(failed)
        await db_session.commit()

        problem = await resend_problem(db_session, failed, resent=False)
        assert problem is not None
        assert "inactive" in problem.lower()


# ---------------------------------------------------------------------------
# Deactivate: switched off, nothing deleted, when / who / why kept
# ---------------------------------------------------------------------------


class TestDeactivate:
    async def test_keeps_the_record_and_remembers_when_who_and_why(
        self, client: AsyncClient, db_session, make_user
    ):
        admin, headers = await _user(make_user, "admin")
        patient = await _patient(db_session, allergies=None)

        resp = await client.post(
            f"/api/v1/patients/{patient.id}/deactivate", json={"reason": REASON}, headers=headers
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["is_active"] is False
        assert body["deactivation_reason"] == REASON
        assert body["deactivated_by_name"] == admin.full_name
        assert body["deactivated_at"] is not None

        # Still there, all fields intact: nothing was deleted.
        await db_session.refresh(patient)
        assert patient.is_active is False
        assert patient.first_name == "Dina"
        assert patient.deactivated_by == admin.id
        assert patient.deactivated_at is not None

        # Staff can still open the record directly.
        got = await client.get(f"/api/v1/patients/{patient.id}", headers=headers)
        assert got.status_code == 200
        assert got.json()["is_active"] is False

    async def test_writes_a_deactivate_audit_row_with_the_reason(
        self, client: AsyncClient, db_session, make_user
    ):
        _, headers = await _user(make_user, "admin")
        patient = await _patient(db_session)

        await client.post(
            f"/api/v1/patients/{patient.id}/deactivate", json={"reason": REASON}, headers=headers
        )

        rows = await _audit_rows(db_session, patient.id, "DEACTIVATE")
        assert len(rows) == 1
        assert rows[0].metadata_["reason"] == REASON
        assert rows[0].metadata_["patient_code"] == patient.patient_code
        assert await _audit_rows(db_session, patient.id, "DELETE") == []

    @pytest.mark.parametrize("body", [{}, {"reason": "abc"}], ids=["missing", "too_short"])
    async def test_needs_a_reason(self, client: AsyncClient, db_session, make_user, body):
        _, headers = await _user(make_user, "admin")
        patient = await _patient(db_session)

        resp = await client.post(
            f"/api/v1/patients/{patient.id}/deactivate", json=body, headers=headers
        )

        assert resp.status_code == 422
        await db_session.refresh(patient)
        assert patient.is_active is True

    async def test_twice_is_a_conflict(self, client: AsyncClient, db_session, make_user):
        _, headers = await _user(make_user, "admin")
        patient = await _patient(db_session, is_active=False)

        resp = await client.post(
            f"/api/v1/patients/{patient.id}/deactivate", json={"reason": REASON}, headers=headers
        )
        assert resp.status_code == 409

    async def test_old_delete_route_still_only_deactivates(
        self, client: AsyncClient, db_session, make_user
    ):
        """DELETE /patients/{id} is kept for older screens: it deactivates, never deletes."""
        admin, headers = await _user(make_user, "admin")
        patient = await _patient(db_session)

        resp = await client.delete(f"/api/v1/patients/{patient.id}", headers=headers)

        assert resp.status_code == 204
        await db_session.refresh(patient)
        assert patient.is_active is False
        assert patient.deactivated_by == admin.id
        assert len(await _audit_rows(db_session, patient.id, "DEACTIVATE")) == 1

    @pytest.mark.parametrize("role", ["bhw", "physician", "admin_staff"])
    async def test_admin_only(self, client: AsyncClient, db_session, make_user, role):
        _, headers = await _user(make_user, role)
        patient = await _patient(db_session)

        resp = await client.post(
            f"/api/v1/patients/{patient.id}/deactivate", json={"reason": REASON}, headers=headers
        )
        assert resp.status_code == 403
        await db_session.refresh(patient)
        assert patient.is_active is True


# ---------------------------------------------------------------------------
# Reactivate: back in the list, history kept in the audit log
# ---------------------------------------------------------------------------


class TestReactivate:
    async def test_switches_the_patient_back_on(self, client: AsyncClient, db_session, make_user):
        admin, headers = await _user(make_user, "admin")
        patient = await _patient(
            db_session,
            is_active=False,
            deactivated_at=datetime.now(tz=UTC),
            deactivated_by=admin.id,
            deactivation_reason=REASON,
        )

        resp = await client.post(f"/api/v1/patients/{patient.id}/reactivate", headers=headers)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["is_active"] is True
        assert body["deactivated_at"] is None
        assert body["deactivation_reason"] is None

        listed = await client.get(
            "/api/v1/patients", params={"q": patient.patient_code}, headers=headers
        )
        assert [p["id"] for p in listed.json()["items"]] == [str(patient.id)]

        rows = await _audit_rows(db_session, patient.id, "REACTIVATE")
        assert len(rows) == 1
        assert rows[0].metadata_["previous_reason"] == REASON

    async def test_reactivated_patient_gets_reminders_again(
        self, client: AsyncClient, db_session, make_user
    ):
        _, headers = await _user(make_user, "admin")
        patient = await _patient(db_session, is_active=False)
        appt = Appointment(
            id=uuid.uuid4(),
            patient_id=patient.id,
            appointment_type="consultation",
            scheduled_at=datetime.now(tz=UTC) + timedelta(hours=24),
            status="pending",
        )
        db_session.add(appt)
        await db_session.commit()

        await client.post(f"/api/v1/patients/{patient.id}/reactivate", headers=headers)
        with patch("app.workers.reminder_scheduler.send_reminder_task") as task:
            task.delay = MagicMock()
            await _dispatch_appointment_reminders_async()

        assert await _sms_count(db_session, appointment_id=appt.id) == 1

    async def test_active_patient_is_a_conflict(self, client: AsyncClient, db_session, make_user):
        _, headers = await _user(make_user, "admin")
        patient = await _patient(db_session)

        resp = await client.post(f"/api/v1/patients/{patient.id}/reactivate", headers=headers)
        assert resp.status_code == 409

    async def test_unknown_patient_is_404(self, client: AsyncClient, make_user):
        _, headers = await _user(make_user, "admin")
        resp = await client.post(f"/api/v1/patients/{uuid.uuid4()}/reactivate", headers=headers)
        assert resp.status_code == 404

    @pytest.mark.parametrize("role", ["bhw", "physician", "admin_staff"])
    async def test_admin_only(self, client: AsyncClient, db_session, make_user, role):
        _, headers = await _user(make_user, role)
        patient = await _patient(db_session, is_active=False)

        resp = await client.post(f"/api/v1/patients/{patient.id}/reactivate", headers=headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Inactive Patients list: where deactivated patients go
# ---------------------------------------------------------------------------


class TestInactiveList:
    async def test_lists_only_inactive_patients_with_when_who_why(
        self, client: AsyncClient, db_session, make_user
    ):
        admin, headers = await _user(make_user, "admin")
        tag = uuid.uuid4().hex[:6].upper()
        inactive = await _patient(
            db_session,
            patient_code=f"IN-{tag}-1",
            is_active=False,
            deactivated_at=datetime.now(tz=UTC),
            deactivated_by=admin.id,
            deactivation_reason=REASON,
        )
        await _patient(db_session, patient_code=f"IN-{tag}-2")  # active: not listed

        resp = await client.get(
            "/api/v1/patients/inactive", params={"q": f"IN-{tag}"}, headers=headers
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1
        row = body["items"][0]
        assert row["id"] == str(inactive.id)
        assert row["deactivation_reason"] == REASON
        assert row["deactivated_by_name"] == admin.full_name
        assert row["deactivated_at"] is not None

    async def test_patient_deactivated_before_this_change_is_listed_too(
        self, client: AsyncClient, db_session, make_user
    ):
        """Old rows have no date / reason yet; they still show up."""
        _, headers = await _user(make_user, "admin")
        old = await _patient(db_session, is_active=False)

        resp = await client.get(
            "/api/v1/patients/inactive", params={"q": old.patient_code}, headers=headers
        )

        assert [p["id"] for p in resp.json()["items"]] == [str(old.id)]
        assert resp.json()["items"][0]["deactivated_at"] is None

    async def test_writes_a_view_phi_audit_row(self, client: AsyncClient, db_session, make_user):
        admin, headers = await _user(make_user, "admin")
        await client.get("/api/v1/patients/inactive", headers=headers)

        rows = await db_session.execute(
            select(AuditLog).where(
                AuditLog.user_id == admin.id,
                AuditLog.action == "VIEW_PHI",
                AuditLog.entity_type == "patient_inactive_list",
            )
        )
        assert len(rows.scalars().all()) == 1

    @pytest.mark.parametrize(("role", "code"), [("physician", 200), ("bhw", 403), ("admin_staff", 403)])
    async def test_admin_and_physician_only(self, client: AsyncClient, make_user, role, code):
        _, headers = await _user(make_user, role)
        resp = await client.get("/api/v1/patients/inactive", headers=headers)
        assert resp.status_code == code


# ---------------------------------------------------------------------------
# After-hours alert still sees deactivations under the new action name
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("action", ["DEACTIVATE", "DELETE"])
async def test_after_hours_alert_counts_deactivations(db_session, make_user, action):
    admin, _ = await _user(make_user, "admin")
    entity = uuid.uuid4()
    # 23:00 Manila yesterday-or-today, always inside the last 24 h window.
    now = datetime.now(tz=UTC)
    late = now.replace(hour=15, minute=0, second=0, microsecond=0)
    if late > now:
        late -= timedelta(days=1)
    db_session.add(
        AuditLog(
            id=uuid.uuid4(),
            user_id=admin.id,
            action=action,
            entity_type="patient",
            entity_id=entity,
            created_at=late,
        )
    )
    await db_session.commit()

    events = await audit_anomaly_service.check_after_hours_deletes(db_session)

    assert any(str(entity) in e.detail for e in events)
