"""
Resend a failed SMS (POST /api/v1/sms/logs/{id}/resend).

A resend never edits the failed row: it creates a NEW sms_logs row linked to
it (metadata resend_of), addressed to the patient's CURRENT mobile number
(so "Fix number" then "Resend" works), and queues it like any reminder.

Refused (409, with a reason the BHW can read) when the row is not failed,
was already resent, the patient is archived / has no number / opted out,
the appointment is past, cancelled or completed (except the after-miss
follow-up, which is about a past appointment by design), or the dose is no
longer scheduled. Appointment reminders get a fresh CONFIRM code so a reply
matches exactly one row.

The BHW dashboard's failed-SMS list says per row whether it can be resent
and whether it already was.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock, patch

import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.audit_log import AuditLog
from app.models.immunization import Immunization
from app.models.patient import Patient
from app.models.sms_log import SmsLog

NOW = datetime.now(tz=UTC)


def _url(log_id: uuid.UUID | str) -> str:
    return f"/api/v1/sms/logs/{log_id}/resend"


async def _patient(db: AsyncSession, **overrides: Any) -> Patient:
    fields: dict[str, Any] = {
        "id": uuid.uuid4(),
        "patient_code": f"RS-{uuid.uuid4().hex[:8].upper()}",
        "first_name": "Resa",
        "last_name": "Test",
        "birth_date": date(1990, 1, 1),
        "sex": "female",
        "address": "Barangay Test",
        "mobile_number": "+639171111111",
        "is_active": True,
    }
    fields.update(overrides)
    patient = Patient(**fields)
    db.add(patient)
    await db.flush()
    return patient


async def _appointment(
    db: AsyncSession, patient: Patient, when: datetime, status: str = "pending"
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


async def _failed(
    db: AsyncSession,
    patient: Patient | None,
    *,
    appointment: Appointment | None = None,
    immunization: Immunization | None = None,
    message: str = "Hi Resa, reminder for your checkup. CONFIRM 1234 to confirm.",
    metadata: dict[str, Any] | None = None,
    status: str = "failed",
) -> SmsLog:
    if metadata is None:
        metadata = (
            {"confirmation_token": "1234", "appointment_id": str(appointment.id)}
            if appointment is not None
            else {}
        )
    log = SmsLog(
        id=uuid.uuid4(),
        patient_id=patient.id if patient else None,
        appointment_id=appointment.id if appointment else None,
        immunization_id=immunization.id if immunization else None,
        mobile_number="+639170000000",  # the old, wrong number
        message=message,
        status=status,
        error_detail="Invalid number",
        sms_metadata=metadata,
    )
    db.add(log)
    await db.commit()
    return log


async def _headers(make_user, role: str = "bhw") -> tuple[dict[str, str], uuid.UUID]:
    user = await make_user(role)
    token = create_access_token(subject=str(user.id), role=role)
    return {"Authorization": f"Bearer {token}", "X-Forwarded-For": "198.51.100.30"}, user.id


async def _resend(client: AsyncClient, headers: dict[str, str], log_id: uuid.UUID):
    with patch("app.api.v1.endpoints.sms.send_reminder_task") as task:
        task.delay = MagicMock()
        resp = await client.post(_url(log_id), headers=headers)
    return resp, task.delay


async def _resends_of(db: AsyncSession, log_id: uuid.UUID) -> list[SmsLog]:
    result = await db.execute(
        sa.select(SmsLog).where(SmsLog.sms_metadata["resend_of"].astext == str(log_id))
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


class TestResend:
    async def test_bhw_resends_an_appointment_reminder_to_the_current_number(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ):
        patient = await _patient(db_session)
        appt = await _appointment(db_session, patient, NOW + timedelta(days=1))
        failed = await _failed(db_session, patient, appointment=appt)
        headers, _ = await _headers(make_user)

        resp, delay = await _resend(client, headers, failed.id)

        assert resp.status_code == 202, resp.text
        body = resp.json()
        assert body["status"] == "queued"
        new_rows = await _resends_of(db_session, failed.id)
        assert len(new_rows) == 1
        new = new_rows[0]
        assert str(new.id) == body["sms_log_id"]
        delay.assert_called_once_with(str(new.id))

        assert new.status == "queued"
        assert new.mobile_number == "+639171111111"  # patient's current number
        assert new.patient_id == patient.id
        assert new.appointment_id == appt.id
        # Fresh CONFIRM code, in the text and in the metadata.
        token = new.sms_metadata["confirmation_token"]
        assert re.fullmatch(r"\d{4}", token)
        assert token != "1234"
        assert new.message == f"Hi Resa, reminder for your checkup. CONFIRM {token} to confirm."
        assert new.sms_metadata["appointment_id"] == str(appt.id)

        # The failed row is history: unchanged.
        await db_session.refresh(failed)
        assert failed.status == "failed"
        assert failed.mobile_number == "+639170000000"
        assert failed.sms_metadata == {"confirmation_token": "1234", "appointment_id": str(appt.id)}

    async def test_admin_may_resend(self, client: AsyncClient, make_user, db_session: AsyncSession):
        patient = await _patient(db_session)
        failed = await _failed(db_session, patient, message="Welcome to the BHC.")
        headers, _ = await _headers(make_user, "admin")

        resp, _ = await _resend(client, headers, failed.id)

        assert resp.status_code == 202, resp.text

    async def test_other_sms_keeps_its_text_and_metadata(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ):
        patient = await _patient(db_session)
        failed = await _failed(
            db_session, patient, message="Welcome to the BHC.", metadata={"message_type": "welcome"}
        )
        headers, _ = await _headers(make_user)

        resp, _ = await _resend(client, headers, failed.id)

        assert resp.status_code == 202, resp.text
        new = (await _resends_of(db_session, failed.id))[0]
        assert new.message == "Welcome to the BHC."
        assert new.sms_metadata == {"message_type": "welcome", "resend_of": str(failed.id)}

    async def test_scheduled_dose_reminder_can_be_resent(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ):
        patient = await _patient(db_session)
        dose = Immunization(
            id=uuid.uuid4(),
            patient_id=patient.id,
            vaccine_name="MMR",
            dose_number=1,
            next_due_date=NOW.date() + timedelta(days=2),
            status="scheduled",
        )
        db_session.add(dose)
        failed = await _failed(db_session, patient, immunization=dose, message="MMR due soon.")
        headers, _ = await _headers(make_user)

        resp, _ = await _resend(client, headers, failed.id)

        assert resp.status_code == 202, resp.text
        assert (await _resends_of(db_session, failed.id))[0].immunization_id == dose.id

    async def test_after_miss_follow_up_can_be_resent(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ):
        """It is about a past, missed appointment by design."""
        patient = await _patient(db_session)
        appt = await _appointment(db_session, patient, NOW - timedelta(hours=6), "missed")
        failed = await _failed(
            db_session,
            patient,
            appointment=appt,
            message="We missed you today. Please rebook.",
            metadata={"trigger": "post_miss_followup"},
        )
        headers, _ = await _headers(make_user)

        resp, _ = await _resend(client, headers, failed.id)

        assert resp.status_code == 202, resp.text

    async def test_resend_is_audited(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ):
        patient = await _patient(db_session)
        failed = await _failed(db_session, patient, message="Welcome to the BHC.")
        headers, user_id = await _headers(make_user)

        resp, _ = await _resend(client, headers, failed.id)

        new_id = uuid.UUID(resp.json()["sms_log_id"])
        rows = (
            (
                await db_session.execute(
                    sa.select(AuditLog).where(
                        AuditLog.entity_type == "sms_log", AuditLog.entity_id == new_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].action == "CREATE"
        assert rows[0].user_id == user_id
        assert rows[0].ip_address == "198.51.100.30"
        assert rows[0].metadata_ == {"resend_of": str(failed.id), "kind": "other"}


# ---------------------------------------------------------------------------
# Refusals
# ---------------------------------------------------------------------------


class TestRefused:
    async def _refused(
        self, client: AsyncClient, make_user, log: SmsLog, db_session: AsyncSession
    ) -> str:
        headers, _ = await _headers(make_user)
        resp, delay = await _resend(client, headers, log.id)
        assert resp.status_code == 409, resp.text
        delay.assert_not_called()
        assert await _resends_of(db_session, log.id) == []
        return resp.json()["error"]["message"]

    async def test_only_failed_sms(self, client, make_user, db_session):
        patient = await _patient(db_session)
        sent = await _failed(db_session, patient, message="Hi", status="sent")
        assert "failed" in (await self._refused(client, make_user, sent, db_session)).lower()

    async def test_only_once(self, client, make_user, db_session):
        patient = await _patient(db_session)
        failed = await _failed(db_session, patient, message="Hi")
        headers, _ = await _headers(make_user)
        first, _ = await _resend(client, headers, failed.id)
        assert first.status_code == 202

        second, delay = await _resend(client, headers, failed.id)

        assert second.status_code == 409
        assert "already" in second.json()["error"]["message"].lower()
        delay.assert_not_called()
        assert len(await _resends_of(db_session, failed.id)) == 1

    async def test_patient_without_number(self, client, make_user, db_session):
        patient = await _patient(db_session, mobile_number=None)
        failed = await _failed(db_session, patient, message="Hi")
        assert "mobile number" in (await self._refused(client, make_user, failed, db_session))

    async def test_patient_opted_out(self, client, make_user, db_session):
        patient = await _patient(db_session, sms_opt_out=True)
        failed = await _failed(db_session, patient, message="Hi")
        assert "opted out" in (await self._refused(client, make_user, failed, db_session))

    async def test_archived_patient(self, client, make_user, db_session):
        patient = await _patient(db_session, is_active=False)
        failed = await _failed(db_session, patient, message="Hi")
        await self._refused(client, make_user, failed, db_session)

    async def test_appointment_already_passed(self, client, make_user, db_session):
        patient = await _patient(db_session)
        appt = await _appointment(db_session, patient, NOW - timedelta(minutes=5))
        failed = await _failed(db_session, patient, appointment=appt)
        assert "appointment" in (await self._refused(client, make_user, failed, db_session))

    async def test_appointment_cancelled_or_completed(self, client, make_user, db_session):
        patient = await _patient(db_session)
        for status in ("cancelled", "completed"):
            appt = await _appointment(db_session, patient, NOW + timedelta(days=1), status)
            failed = await _failed(db_session, patient, appointment=appt)
            await self._refused(client, make_user, failed, db_session)

    async def test_dose_no_longer_scheduled(self, client, make_user, db_session):
        patient = await _patient(db_session)
        dose = Immunization(
            id=uuid.uuid4(),
            patient_id=patient.id,
            vaccine_name="MMR",
            dose_number=1,
            next_due_date=NOW.date(),
            status="completed",
        )
        db_session.add(dose)
        failed = await _failed(db_session, patient, immunization=dose, message="MMR due.")
        assert "dose" in (await self._refused(client, make_user, failed, db_session))


class TestAccess:
    async def test_physician_and_front_desk_may_not_resend(self, client, make_user, db_session):
        patient = await _patient(db_session)
        failed = await _failed(db_session, patient, message="Hi")
        for role in ("physician", "admin_staff"):
            headers, _ = await _headers(make_user, role)
            resp, _ = await _resend(client, headers, failed.id)
            assert resp.status_code == 403, role

    async def test_unknown_sms_is_404(self, client, make_user):
        headers, _ = await _headers(make_user)
        resp, _ = await _resend(client, headers, uuid.uuid4())
        assert resp.status_code == 404

    async def test_needs_sign_in(self, client):
        assert (await client.post(_url(uuid.uuid4()))).status_code == 401


# ---------------------------------------------------------------------------
# BHW dashboard
# ---------------------------------------------------------------------------


class TestDashboardRows:
    async def _failed_rows(self, client: AsyncClient, headers: dict[str, str]) -> dict[str, Any]:
        resp = await client.get("/api/v1/dashboard/me", headers=headers)
        assert resp.status_code == 200, resp.text
        return {row["id"]: row for row in resp.json()["failed_sms"]}

    async def test_rows_say_whether_they_can_be_resent(
        self, client: AsyncClient, make_user, db_session: AsyncSession
    ):
        patient = await _patient(db_session)
        upcoming = await _appointment(db_session, patient, NOW + timedelta(days=1))
        past = await _appointment(db_session, patient, NOW - timedelta(hours=1))
        can = await _failed(db_session, patient, appointment=upcoming)
        cannot = await _failed(db_session, patient, appointment=past)
        headers, _ = await _headers(make_user)

        rows = await self._failed_rows(client, headers)
        assert rows[str(can.id)]["can_resend"] is True
        assert rows[str(can.id)]["resent"] is False
        assert rows[str(cannot.id)]["can_resend"] is False
        assert rows[str(cannot.id)]["resent"] is False

        resp, _ = await _resend(client, headers, can.id)
        assert resp.status_code == 202

        rows = await self._failed_rows(client, headers)
        assert rows[str(can.id)]["resent"] is True
        assert rows[str(can.id)]["can_resend"] is False
