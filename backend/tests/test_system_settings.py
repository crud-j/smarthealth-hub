"""
Tests for admin-editable system settings (GET/PUT /system/settings) and the
places that use them (reminder scheduler, registration QR, system info).

Covers:
  - Defaults when nothing is saved (.env values, built-in templates).
  - Admin saves, reads back, resets with null; values equal to the default
    are not stored.
  - Every real change is audited (UPDATE system_settings, old -> new); a
    no-op save writes nothing.
  - Unsafe/broken templates, out-of-range numbers and unknown fields -> 422.
  - Non-admins cannot read or change the settings (403).
  - The reminder scheduler uses the saved lead times and templates, and falls
    back to the built-in template if a stored one is broken.

Fixtures from conftest.py: client, admin_token, bhw_token, db_session
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.appointment import Appointment
from app.models.audit_log import AuditLog
from app.models.immunization import Immunization
from app.models.patient import Patient
from app.models.sms_log import SmsLog
from app.models.system_setting import SystemSetting
from app.services.sms_templates import TEMPLATE_DEFAULTS
from app.workers.reminder_scheduler import (
    _dispatch_appointment_reminders_async,
    _dispatch_immunization_reminders_async,
)

URL = "/api/v1/system/settings"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _settings_audits(db_session: AsyncSession) -> list[dict]:
    rows = await db_session.execute(
        sa.select(AuditLog.metadata_).where(
            AuditLog.entity_type == "system_settings", AuditLog.action == "UPDATE"
        )
    )
    return [m for (m,) in rows.all()]


# ---------------------------------------------------------------------------
# GET / PUT
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_defaults_when_nothing_is_saved(client: AsyncClient, admin_token: str) -> None:
    response = await client.get(URL, headers=_auth(admin_token))
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["bhc_name"] == {
        "value": settings.BHC_NAME,
        "default": settings.BHC_NAME,
        "is_custom": False,
        "updated_at": None,
        "updated_by": None,
    }
    assert body["sms_reminder_lead_hours"]["value"] == settings.SMS_REMINDER_LEAD_HOURS
    assert body["sms_immunization_lead_days"]["value"] == settings.SMS_IMMUNIZATION_LEAD_DAYS

    templates = {(t["kind"], t["language"]): t for t in body["sms_templates"]}
    assert len(templates) == 6
    appt_en = templates[("appointment_reminder", "en")]
    assert appt_en["value"] == TEMPLATE_DEFAULTS["appointment_reminder"]["en"]
    assert appt_en["is_custom"] is False
    assert "scheduled_date" in appt_en["required"]
    assert appt_en["send_limit"] == 135
    assert templates[("missed_appointment", "fil")]["send_limit"] is None
    assert body["sample_values"]["bhc_name"] == settings.BHC_NAME


@pytest.mark.asyncio
async def test_admin_saves_and_reads_back(
    client: AsyncClient, admin_token: str, db_session: AsyncSession
) -> None:
    payload = {
        "bhc_name": "  BHC Uno  ",
        "sms_reminder_lead_hours": 48,
        "sms_templates": {"missed_appointment.en": "Hi {first_name}, please call {bhc_name}."},
    }
    response = await client.put(URL, json=payload, headers=_auth(admin_token))
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["bhc_name"]["value"] == "BHC Uno"
    assert body["bhc_name"]["is_custom"] is True
    assert body["bhc_name"]["updated_by"] == "Test Admin User"
    assert body["bhc_name"]["updated_at"] is not None
    assert body["sms_reminder_lead_hours"]["value"] == 48
    assert body["sms_immunization_lead_days"]["is_custom"] is False
    missed = next(
        t
        for t in body["sms_templates"]
        if t["kind"] == "missed_appointment" and t["language"] == "en"
    )
    assert missed["value"] == "Hi {first_name}, please call {bhc_name}."
    assert body["sample_values"]["bhc_name"] == "BHC Uno"

    again = await client.get(URL, headers=_auth(admin_token))
    assert again.json()["bhc_name"]["value"] == "BHC Uno"

    audits = await _settings_audits(db_session)
    assert len(audits) == 1
    changes = audits[0]["changes"]
    assert changes["bhc_name"] == {"from": settings.BHC_NAME, "to": "BHC Uno"}
    assert changes["sms_reminder_lead_hours"] == {
        "from": settings.SMS_REMINDER_LEAD_HOURS,
        "to": 48,
    }
    assert set(changes) == {
        "bhc_name",
        "sms_reminder_lead_hours",
        "sms_template.missed_appointment.en",
    }


@pytest.mark.asyncio
async def test_null_resets_to_default(
    client: AsyncClient, admin_token: str, db_session: AsyncSession
) -> None:
    await client.put(URL, json={"bhc_name": "BHC Uno"}, headers=_auth(admin_token))
    response = await client.put(URL, json={"bhc_name": None}, headers=_auth(admin_token))
    assert response.status_code == 200, response.text
    assert response.json()["bhc_name"]["value"] == settings.BHC_NAME
    assert response.json()["bhc_name"]["is_custom"] is False

    stored = await db_session.execute(
        sa.select(SystemSetting).where(SystemSetting.key == "bhc_name")
    )
    assert stored.scalar_one_or_none() is None
    assert len(await _settings_audits(db_session)) == 2


@pytest.mark.asyncio
async def test_no_op_save_and_default_value_write_nothing(
    client: AsyncClient, admin_token: str, db_session: AsyncSession
) -> None:
    # Same as the default: not stored, not audited.
    response = await client.put(
        URL,
        json={"sms_reminder_lead_hours": settings.SMS_REMINDER_LEAD_HOURS},
        headers=_auth(admin_token),
    )
    assert response.status_code == 200, response.text
    assert response.json()["sms_reminder_lead_hours"]["is_custom"] is False

    await client.put(URL, json={"bhc_name": "BHC Uno"}, headers=_auth(admin_token))
    await client.put(URL, json={"bhc_name": "BHC Uno"}, headers=_auth(admin_token))
    assert len(await _settings_audits(db_session)) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("payload", "message"),
    [
        (
            {"sms_templates": {"appointment_reminder.en": "Hi {secret}"}},
            "Unknown placeholder {secret}",
        ),
        (
            {
                "sms_templates": {
                    "appointment_reminder.en": "{patient_name.__class__} {scheduled_date} {scheduled_time}"
                }
            },
            "Unknown placeholder",
        ),
        (
            {"sms_templates": {"appointment_reminder.en": "Hi {patient_name}"}},
            "Must include {scheduled_date}",
        ),
        ({"sms_templates": {"birthday.en": "Happy birthday"}}, "Unknown template"),
        ({"sms_reminder_lead_hours": 0}, "greater than or equal to 1"),
        ({"sms_immunization_lead_days": 31}, "less than or equal to 30"),
        ({"bhc_name": " x "}, "at least 2 characters"),
        ({"smtp_password": "x"}, "Extra inputs are not permitted"),
    ],
)
async def test_invalid_changes_are_rejected(
    client: AsyncClient, admin_token: str, db_session: AsyncSession, payload: dict, message: str
) -> None:
    response = await client.put(URL, json=payload, headers=_auth(admin_token))
    assert response.status_code == 422, response.text
    assert message in response.text
    assert await _settings_audits(db_session) == []


@pytest.mark.asyncio
async def test_non_admin_cannot_read_or_change(client: AsyncClient, bhw_token: str) -> None:
    assert (await client.get(URL, headers=_auth(bhw_token))).status_code == 403
    response = await client.put(URL, json={"bhc_name": "Hacked"}, headers=_auth(bhw_token))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_saved_name_and_lead_times_show_everywhere(
    client: AsyncClient, admin_token: str, bhw_token: str
) -> None:
    await client.put(
        URL,
        json={"bhc_name": "BHC Uno", "sms_immunization_lead_days": 5},
        headers=_auth(admin_token),
    )
    info = await client.get("/api/v1/system/info", headers=_auth(admin_token))
    assert info.json()["bhc_name"] == "BHC Uno"
    assert info.json()["sms_immunization_lead_days"] == 5

    # The registration QR poster (any staff) shows the saved name too.
    qr = await client.get("/api/v1/system/registration-url", headers=_auth(bhw_token))
    assert qr.status_code == 200, qr.text
    assert qr.json()["bhc_name"] == "BHC Uno"


# ---------------------------------------------------------------------------
# The reminder scheduler uses the saved values
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def patient(db_session: AsyncSession) -> Patient:
    p = Patient(
        id=uuid.uuid4(),
        patient_code=f"BHC-2026-{uuid.uuid4().hex[:6].upper()}",
        first_name="Maria",
        middle_name="Santos",
        last_name="Dela Cruz",
        birth_date=date(1990, 5, 15),
        sex="female",
        address="123 Barangay Street",
        mobile_number="+639171234567",
        is_active=True,
    )
    db_session.add(p)
    await db_session.commit()
    return p


async def _queued_messages(db_session: AsyncSession, **where: object) -> list[str]:
    stmt = sa.select(SmsLog.message)
    for column, value in where.items():
        stmt = stmt.where(getattr(SmsLog, column) == value)
    return [m for (m,) in (await db_session.execute(stmt)).all()]


@pytest.mark.asyncio
async def test_appointment_reminder_uses_saved_lead_time_and_template(
    client: AsyncClient, admin_token: str, db_session: AsyncSession, patient: Patient
) -> None:
    await client.put(
        URL,
        json={
            "bhc_name": "BHC Uno",
            "sms_reminder_lead_hours": 48,
            "sms_templates": {
                "appointment_reminder.en": "Paalala {patient_name}: {appointment_type} {scheduled_date} {scheduled_time} sa {bhc_name}."
            },
        },
        headers=_auth(admin_token),
    )
    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=patient.id,
        appointment_type="follow_up",
        scheduled_at=datetime.now(tz=UTC) + timedelta(hours=48),
        status="pending",
    )
    db_session.add(appt)
    await db_session.commit()
    appt_id = appt.id

    with patch("app.workers.reminder_scheduler.send_reminder_task") as task:
        task.delay = MagicMock()
        await _dispatch_appointment_reminders_async()

    messages = await _queued_messages(db_session, appointment_id=appt_id)
    assert len(messages) == 1
    assert messages[0].startswith("Paalala Maria Santos Dela Cruz: follow up ")
    assert "sa BHC Uno." in messages[0]
    assert messages[0].endswith("to confirm.")


@pytest.mark.asyncio
async def test_immunization_reminder_uses_saved_lead_days_and_template(
    client: AsyncClient, admin_token: str, db_session: AsyncSession, patient: Patient
) -> None:
    await client.put(
        URL,
        json={
            "sms_immunization_lead_days": 5,
            "sms_templates": {
                "immunization_reminder.en": "{patient_name}: {vaccine_name} on {due_date} at {bhc_name}"
            },
        },
        headers=_auth(admin_token),
    )
    shot = Immunization(
        id=uuid.uuid4(),
        patient_id=patient.id,
        vaccine_name="Hepatitis B",
        dose_number=1,
        next_due_date=(datetime.now(tz=UTC) + timedelta(days=5)).date(),
        status="scheduled",
    )
    db_session.add(shot)
    await db_session.commit()
    shot_id = shot.id

    with patch("app.workers.reminder_scheduler.send_reminder_task") as task:
        task.delay = MagicMock()
        await _dispatch_immunization_reminders_async()

    messages = await _queued_messages(db_session, immunization_id=shot_id)
    assert len(messages) == 1
    assert messages[0].startswith("Maria Santos Dela Cruz: Hepatitis B on ")
    assert messages[0].endswith(f"at {settings.BHC_NAME}")


@pytest.mark.asyncio
async def test_broken_stored_template_falls_back_to_default(
    db_session: AsyncSession, patient: Patient
) -> None:
    """A bad row (e.g. edited by hand in the DB) must not stop reminders."""
    db_session.add(
        SystemSetting(
            key="sms_template.immunization_reminder.en",
            value="{patient_name.__class__}",
            updated_at=datetime.now(tz=UTC),
        )
    )
    shot = Immunization(
        id=uuid.uuid4(),
        patient_id=patient.id,
        vaccine_name="Hepatitis B",
        dose_number=1,
        next_due_date=(
            datetime.now(tz=UTC) + timedelta(days=settings.SMS_IMMUNIZATION_LEAD_DAYS)
        ).date(),
        status="scheduled",
    )
    db_session.add(shot)
    await db_session.commit()
    shot_id = shot.id

    with patch("app.workers.reminder_scheduler.send_reminder_task") as task:
        task.delay = MagicMock()
        await _dispatch_immunization_reminders_async()

    messages = await _queued_messages(db_session, immunization_id=shot_id)
    assert len(messages) == 1
    assert messages[0].startswith("Hi Maria Santos Dela Cruz, Hepatitis B immunization due ")
    assert "__class__" not in messages[0]
