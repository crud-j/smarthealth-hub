"""
Tests for Phase 4 — Appointments & SMS Reminders.

Coverage:
  Scheduler:
    test_scheduler_finds_due_appointments         — appointment 24h out → sms_log created
    test_scheduler_no_double_queue                — existing sms_log → no second row
    test_immunization_scheduler_finds_due         — immunization 3 days out → sms_log
    test_immunization_no_double_queue             — existing immunization sms_log → skip

  Celery tasks (sync, no real broker needed):
    test_send_reminder_task_success               — mock send_sms → status=sent
    test_send_reminder_task_transient_retry       — SMSTransientError → Retry raised
    test_send_reminder_task_permanent_failure     — SMSPermanentError → status=failed, no Retry

  HTTP endpoints:
    test_create_appointment_success               — POST /appointments → 201
    test_create_appointment_past_date             — POST with past time → 422
    test_list_appointments                        — GET /appointments → paginated
    test_get_appointment                          — GET /appointments/{id}
    test_update_appointment                       — PUT /appointments/{id}
    test_cancel_appointment                       — DELETE /appointments/{id} → cancelled
    test_sms_manual_send                          — POST /sms/send-manual → 202
    test_sms_webhook_delivery                     — POST /sms/webhook/delivery-status → 200

All DB fixtures use the SAVEPOINT pattern defined in conftest.py — nothing
persists between tests.  Celery tasks are called synchronously via their
underlying async helper (bypassing the broker) so tests run without Redis.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, UTC
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.security import create_access_token, hash_password
from app.models.appointment import Appointment
from app.models.immunization import Immunization
from app.models.patient import Patient
from app.models.sms_log import SmsLog
from app.models.user import Role, User
from app.services.sms_service import SMSPermanentError, SMSTransientError
from app.workers.reminder_scheduler import (
    _dispatch_appointment_reminders_async,
    _dispatch_immunization_reminders_async,
)
from app.workers.sms_tasks import _load_sms_log_and_send


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def bhw_user(db_session):
    """Create a BHW role + user and return (user, token)."""
    role = Role(id=uuid.uuid4(), name=f"bhw_{uuid.uuid4().hex[:4]}", permissions={})
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
    # Attach a proper "bhw" role name so require_role checks pass
    role.name = "bhw"
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(role)

    token = create_access_token(subject=str(user.id), role="bhw")
    return user, token


@pytest_asyncio.fixture
async def test_patient(db_session, bhw_user):
    """Create a patient with a mobile number."""
    user, _ = bhw_user
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"BHC-2026-{uuid.uuid4().hex[:6].upper()}",
        first_name="Maria",
        middle_name="Santos",
        last_name="Dela Cruz",
        birth_date=date(1990, 5, 15),
        sex="female",
        address="123 Barangay Street, Manila",
        mobile_number="+639171234567",
        is_active=True,
        created_by=user.id,
    )
    db_session.add(patient)
    await db_session.commit()
    await db_session.refresh(patient)
    return patient


@pytest_asyncio.fixture
async def test_appointment(db_session, test_patient, bhw_user):
    """Create a pending appointment 24h from now."""
    user, _ = bhw_user
    scheduled = datetime.now(tz=UTC) + timedelta(hours=24)
    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=test_patient.id,
        appointment_type="consultation",
        scheduled_at=scheduled,
        status="pending",
        created_by=user.id,
    )
    db_session.add(appt)
    await db_session.commit()
    await db_session.refresh(appt)
    return appt


# ---------------------------------------------------------------------------
# Scheduler: appointment reminders
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scheduler_finds_due_appointments(db_session, test_appointment, test_patient):
    """
    Seed an appointment ~24 h from now.  Running the async scheduler core
    should create exactly one sms_log row with status='queued'.
    """
    # Patch send_reminder_task.delay so Celery broker is not needed.
    with patch("app.workers.reminder_scheduler.send_reminder_task") as mock_task:
        mock_task.delay = MagicMock()
        count = await _dispatch_appointment_reminders_async()

    assert count >= 1

    result = await db_session.execute(
        select(SmsLog).where(SmsLog.appointment_id == test_appointment.id)
    )
    logs = result.scalars().all()
    assert len(logs) == 1
    assert logs[0].status == "queued"
    assert logs[0].mobile_number == test_patient.mobile_number


@pytest.mark.asyncio
async def test_scheduler_no_double_queue(db_session, test_appointment, test_patient):
    """
    Seed an appointment + an existing sms_log with status='sent'.
    Running the scheduler again must NOT create a second sms_log row.
    """
    # Insert an existing sms_log for this appointment.
    existing_log = SmsLog(
        id=uuid.uuid4(),
        patient_id=test_patient.id,
        appointment_id=test_appointment.id,
        mobile_number=test_patient.mobile_number,
        message="existing reminder",
        status="sent",
    )
    db_session.add(existing_log)
    await db_session.commit()

    with patch("app.workers.reminder_scheduler.send_reminder_task") as mock_task:
        mock_task.delay = MagicMock()
        count = await _dispatch_appointment_reminders_async()

    # No new rows should have been created for this appointment.
    result = await db_session.execute(
        select(SmsLog).where(SmsLog.appointment_id == test_appointment.id)
    )
    logs = result.scalars().all()
    assert len(logs) == 1  # still only the one we inserted
    assert logs[0].id == existing_log.id


# ---------------------------------------------------------------------------
# Scheduler: immunization reminders
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def test_immunization(db_session, test_patient, bhw_user):
    """Create an immunization with next_due_date == today + 3 days."""
    user, _ = bhw_user
    from app.core.config import settings
    target_date = (datetime.now(tz=UTC) + timedelta(days=settings.SMS_IMMUNIZATION_LEAD_DAYS)).date()
    immunization = Immunization(
        id=uuid.uuid4(),
        patient_id=test_patient.id,
        vaccine_name="Hepatitis B",
        dose_number=1,
        next_due_date=target_date,
        status="scheduled",
        administered_by=user.id,
    )
    db_session.add(immunization)
    await db_session.commit()
    await db_session.refresh(immunization)
    return immunization


@pytest.mark.asyncio
async def test_immunization_scheduler_finds_due(
    db_session, test_immunization, test_patient
):
    """
    Seed an immunization with next_due_date == today + 3.
    Scheduler should create an sms_log row.
    """
    with patch("app.workers.reminder_scheduler.send_reminder_task") as mock_task:
        mock_task.delay = MagicMock()
        count = await _dispatch_immunization_reminders_async()

    assert count >= 1

    result = await db_session.execute(
        select(SmsLog).where(SmsLog.immunization_id == test_immunization.id)
    )
    logs = result.scalars().all()
    assert len(logs) == 1
    assert logs[0].status == "queued"
    assert "immunization" in logs[0].message.lower()


@pytest.mark.asyncio
async def test_immunization_no_double_queue(
    db_session, test_immunization, test_patient
):
    """
    Seed immunization + existing sms_log (status='sent', today).
    Scheduler must not create a second sms_log.
    """
    existing_log = SmsLog(
        id=uuid.uuid4(),
        patient_id=test_patient.id,
        immunization_id=test_immunization.id,
        mobile_number=test_patient.mobile_number,
        message="existing immunization reminder",
        status="sent",
    )
    db_session.add(existing_log)
    await db_session.commit()

    with patch("app.workers.reminder_scheduler.send_reminder_task") as mock_task:
        mock_task.delay = MagicMock()
        await _dispatch_immunization_reminders_async()

    result = await db_session.execute(
        select(SmsLog).where(SmsLog.immunization_id == test_immunization.id)
    )
    logs = result.scalars().all()
    assert len(logs) == 1
    assert logs[0].id == existing_log.id


# ---------------------------------------------------------------------------
# Celery task: send_reminder_task
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def queued_sms_log(db_session, test_patient):
    """Create a sms_log row with status='queued' for task tests."""
    log = SmsLog(
        id=uuid.uuid4(),
        patient_id=test_patient.id,
        mobile_number=test_patient.mobile_number,
        message="Hi Maria Santos Dela Cruz, reminder for your consultation on 08/15/2026.",
        status="queued",
    )
    db_session.add(log)
    await db_session.commit()
    await db_session.refresh(log)
    return log


@pytest.mark.asyncio
async def test_send_reminder_task_success(db_session, queued_sms_log):
    """
    Mock SMSService.send_sms to return {"message_id": "abc123"}.
    Call the async core of send_reminder_task.
    Assert sms_log.status == 'sent' and provider_message_id == 'abc123'.
    """
    with patch(
        "app.workers.sms_tasks.SMSService.send_sms",
        new_callable=AsyncMock,
        return_value={"message_id": "abc123", "status": "queued"},
    ):
        result = await _load_sms_log_and_send(str(queued_sms_log.id))

    assert result["status"] == "sent"
    assert result["provider_message_id"] == "abc123"

    # Verify DB state.
    await db_session.refresh(queued_sms_log)
    assert queued_sms_log.status == "sent"
    assert queued_sms_log.provider_message_id == "abc123"
    assert queued_sms_log.sent_at is not None


@pytest.mark.asyncio
async def test_send_reminder_task_transient_retry(db_session, queued_sms_log):
    """
    Mock SMSService.send_sms to raise SMSTransientError.
    The async core should re-raise SMSTransientError so Celery autoretry fires.
    The sms_log row should be temporarily set to 'failed'.
    """
    with patch(
        "app.workers.sms_tasks.SMSService.send_sms",
        new_callable=AsyncMock,
        side_effect=SMSTransientError("Network error", status_code=0),
    ):
        with pytest.raises(SMSTransientError):
            await _load_sms_log_and_send(str(queued_sms_log.id))

    # Row should be marked 'failed' (temporarily, until retry succeeds).
    await db_session.refresh(queued_sms_log)
    assert queued_sms_log.status == "failed"


@pytest.mark.asyncio
async def test_send_reminder_task_permanent_failure(db_session, queued_sms_log):
    """
    Mock SMSService.send_sms to raise SMSPermanentError.
    The async core should catch it, mark status='failed', and return normally
    (no exception re-raised — Celery will not retry).
    """
    with patch(
        "app.workers.sms_tasks.SMSService.send_sms",
        new_callable=AsyncMock,
        side_effect=SMSPermanentError(
            "Invalid number", status_code=422, body='{"error":"invalid"}'
        ),
    ):
        result = await _load_sms_log_and_send(str(queued_sms_log.id))

    assert result["status"] == "failed"
    assert result["reason"] == "permanent_error"

    await db_session.refresh(queued_sms_log)
    assert queued_sms_log.status == "failed"
    assert queued_sms_log.error_detail is not None
    assert "422" in queued_sms_log.error_detail


# ---------------------------------------------------------------------------
# HTTP: Appointment endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_appointment_success(client, test_patient, bhw_user):
    """POST /appointments with a future datetime returns 201 + AppointmentResponse."""
    _, token = bhw_user
    scheduled = (datetime.now(tz=UTC) + timedelta(days=2)).isoformat()

    resp = await client.post(
        "/api/v1/appointments",
        json={
            "patient_id": str(test_patient.id),
            "appointment_type": "consultation",
            "scheduled_at": scheduled,
            "notes": "Test appointment",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["patient_id"] == str(test_patient.id)
    assert data["status"] == "pending"
    assert data["appointment_type"] == "consultation"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_appointment_past_date(client, test_patient, bhw_user):
    """POST /appointments with a past datetime returns 422."""
    _, token = bhw_user
    past = (datetime.now(tz=UTC) - timedelta(hours=1)).isoformat()

    resp = await client.post(
        "/api/v1/appointments",
        json={
            "patient_id": str(test_patient.id),
            "appointment_type": "consultation",
            "scheduled_at": past,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_list_appointments(client, test_appointment, bhw_user):
    """GET /appointments returns a paginated list."""
    _, token = bhw_user
    resp = await client.get(
        "/api/v1/appointments",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_get_appointment(client, test_appointment, bhw_user):
    """GET /appointments/{id} returns the appointment detail."""
    _, token = bhw_user
    resp = await client.get(
        f"/api/v1/appointments/{test_appointment.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["id"] == str(test_appointment.id)
    assert data["appointment_type"] == "consultation"


@pytest.mark.asyncio
async def test_update_appointment(client, test_appointment, bhw_user):
    """PUT /appointments/{id} updates status to 'confirmed'."""
    _, token = bhw_user
    resp = await client.put(
        f"/api/v1/appointments/{test_appointment.id}",
        json={"status": "confirmed", "notes": "Confirmed by BHW"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "confirmed"
    assert data["notes"] == "Confirmed by BHW"


@pytest.mark.asyncio
async def test_cancel_appointment(client, test_appointment, bhw_user):
    """DELETE /appointments/{id} sets status to 'cancelled'."""
    _, token = bhw_user
    resp = await client.delete(
        f"/api/v1/appointments/{test_appointment.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "cancelled"


# ---------------------------------------------------------------------------
# HTTP: SMS endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sms_manual_send(client, test_patient, bhw_user):
    """
    POST /sms/send-manual creates an sms_log row and returns 202.
    Celery task enqueueing is patched so no broker is needed.
    """
    _, token = bhw_user

    with patch("app.api.v1.endpoints.sms.send_reminder_task") as mock_task:
        mock_task.delay = MagicMock()
        resp = await client.post(
            "/api/v1/sms/send-manual",
            json={
                "patient_id": str(test_patient.id),
                "message": "Reminder: pick up your prescription.",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 202, resp.text
    data = resp.json()
    assert data["status"] == "queued"
    assert "sms_log_id" in data


@pytest.mark.asyncio
async def test_sms_webhook_delivery(client, db_session, queued_sms_log):
    """
    POST /sms/webhook/delivery-status updates sms_log.status to 'delivered'.
    This endpoint is public (no JWT header needed).
    """
    # Give the sms_log a provider_message_id to match against.
    queued_sms_log.status = "sent"
    queued_sms_log.provider_message_id = "webhook-test-001"
    await db_session.commit()

    resp = await client.post(
        "/api/v1/sms/webhook/delivery-status",
        json={"message_id": "webhook-test-001", "status": "Delivered"},
        # Intentionally no Authorization header — this is a public endpoint.
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["received"] is True
    assert data["processed"] is True

    await db_session.refresh(queued_sms_log)
    assert queued_sms_log.status == "delivered"


@pytest.mark.asyncio
async def test_sms_webhook_unknown_message_id(client):
    """
    Webhook with an unknown message_id returns 200 (not_found) so Semaphore
    does not retry indefinitely.
    """
    resp = await client.post(
        "/api/v1/sms/webhook/delivery-status",
        json={"message_id": "nonexistent-999", "status": "Delivered"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["received"] is True
    assert data["processed"] is False
    assert data["reason"] == "not_found"
