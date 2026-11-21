"""
GET /api/v1/dashboard/me: one dashboard per role, decided by the server.

  physician   — visits waiting for a diagnosis (today), consultations,
                follow-ups due, today's appointments, top conditions
  bhw         — immunizations due/overdue by sitio, missed appointments,
                today's SMS, failed reminders, pre-visit drafts, own visits
  admin       — system status, registrations to review, staff accounts,
                security alerts; NOTHING clinical (admin model B)
  admin_staff — today's appointments with pre-visit form status, drafts

Never any diagnosis / treatment text (encrypted columns are not read).
"Today" is the Manila calendar date.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.health_card import HealthCard
from app.models.immunization import Immunization
from app.models.intake_application import IntakeApplication
from app.models.intake_token import PatientIntakeToken
from app.models.medical_history import MedicalHistory
from app.models.patient import Patient
from app.models.sms_log import SmsLog
from app.models.user import User
from app.models.visit import Visit

pytestmark = pytest.mark.asyncio

MANILA = ZoneInfo("Asia/Manila")
URL = "/api/v1/dashboard/me"


def _today() -> date:
    return datetime.now(tz=MANILA).date()


def _at(day: date, hour: int = 12) -> datetime:
    """Manila wall-clock time on `day`, as an aware datetime."""
    return datetime(day.year, day.month, day.day, hour, tzinfo=MANILA)


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


async def _signed_in(make_user, role: str) -> tuple[User, dict[str, str]]:
    user = await make_user(role)
    token = create_access_token(subject=str(user.id), role=role)
    return user, {"Authorization": f"Bearer {token}"}


async def _patient(db, created_by: uuid.UUID, **overrides) -> Patient:
    fields = {
        "id": uuid.uuid4(),
        "patient_code": f"BHC-T-{uuid.uuid4().hex[:8].upper()}",
        "first_name": "Ana",
        "last_name": "Reyes",
        "birth_date": date(2024, 1, 15),
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


async def _visit(db, patient: Patient, recorded_by: uuid.UUID | None, when: datetime, **kw) -> Visit:
    visit = Visit(
        id=uuid.uuid4(),
        patient_id=patient.id,
        recorded_by=recorded_by,
        visit_date=when,
        visit_type=kw.pop("visit_type", "consultation"),
        **kw,
    )
    db.add(visit)
    await db.commit()
    return visit


async def _appointment(db, patient: Patient, when: datetime, **kw) -> Appointment:
    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=patient.id,
        appointment_type=kw.pop("appointment_type", "general_checkup"),
        scheduled_at=when,
        status=kw.pop("status", "pending"),
        **kw,
    )
    db.add(appt)
    await db.commit()
    return appt


async def _dose(db, patient: Patient, due: date, status: str = "scheduled") -> Immunization:
    dose = Immunization(
        id=uuid.uuid4(),
        patient_id=patient.id,
        vaccine_name="Pentavalent",
        dose_number=2,
        next_due_date=due,
        status=status,
    )
    db.add(dose)
    await db.commit()
    return dose


async def _sms(db, patient: Patient | None, status: str, **kw) -> SmsLog:
    log = SmsLog(
        id=uuid.uuid4(),
        patient_id=patient.id if patient else None,
        mobile_number="+639170000001",
        message="Reminder",
        status=status,
        **kw,
    )
    db.add(log)
    await db.commit()
    return log


async def _draft(db, with_data: bool = True) -> PatientIntakeToken:
    token = PatientIntakeToken(
        id=uuid.uuid4(),
        token=uuid.uuid4(),
        expires_at=datetime.now(tz=UTC) + timedelta(days=1),
        draft_data={"first_name": "Draft", "last_name": "Person"} if with_data else None,
    )
    db.add(token)
    await db.commit()
    return token


async def _application(db, status: str = "pending") -> IntakeApplication:
    app = IntakeApplication(
        id=uuid.uuid4(),
        reference_number=f"REF-{uuid.uuid4().hex[:8].upper()}",
        status=status,
        form_data={"first_name": "Online", "last_name": "Applicant"},
    )
    db.add(app)
    await db.commit()
    return app


def _no_clinical_text(body: dict) -> None:
    text = json.dumps(body).lower()
    for forbidden in ("diagnosis", "treatment", "secret-dx", "secret-tx", "allerg", "known_condition"):
        assert forbidden not in text, f"dashboard leaked {forbidden!r}"


# ---------------------------------------------------------------------------
# Access
# ---------------------------------------------------------------------------


async def test_requires_sign_in(client: AsyncClient) -> None:
    resp = await client.get(URL)
    assert resp.status_code == 401


@pytest.mark.parametrize("role", ["physician", "bhw", "admin", "admin_staff"])
async def test_each_role_gets_its_own_dashboard(client: AsyncClient, make_user, role: str) -> None:
    _user, headers = await _signed_in(make_user, role)

    resp = await client.get(URL, headers=headers)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["role"] == role
    assert body["first_name"] == "Test"  # make_user: "Test <Role> User"
    assert body["today"] == _today().isoformat()


# ---------------------------------------------------------------------------
# Physician
# ---------------------------------------------------------------------------


async def test_physician_waiting_queue_is_today_without_diagnosis(
    client: AsyncClient, make_user, db_session
) -> None:
    physician, headers = await _signed_in(make_user, "physician")
    bhw = await make_user("bhw")
    today = _today()
    child = await _patient(db_session, bhw.id, first_name="Waiting", last_name="Child")
    other = await _patient(db_session, bhw.id, first_name="Second", last_name="Waiting")
    done = await _patient(db_session, bhw.id, first_name="Already", last_name="Seen")

    logged_by_bhw = await _visit(
        db_session, child, bhw.id, _at(today, 8), temperature=38.4, weight_kg=11.2
    )
    await _visit(db_session, other, physician.id, _at(today, 9))  # physician-logged, no dx yet
    await _visit(db_session, done, bhw.id, _at(today, 7), diagnosis="secret-dx", treatment_notes="secret-tx")
    await _visit(db_session, child, bhw.id, _at(today - timedelta(days=1), 9))  # yesterday: not today

    body = (await client.get(URL, headers=headers)).json()

    assert body["waiting_count"] == 2
    waiting_ids = [w["visit_id"] for w in body["waiting"]]
    assert str(logged_by_bhw.id) in waiting_ids
    row = next(w for w in body["waiting"] if w["visit_id"] == str(logged_by_bhw.id))
    assert row["patient"]["full_name"] == "Waiting Child"
    assert row["recorded_by_name"] == bhw.full_name
    assert row["temperature"] == 38.4
    assert body["consultations_today"] == 1
    assert body["consultations_week"] >= 1
    _no_clinical_text(body)


async def test_physician_follow_ups_appointments_and_conditions(
    client: AsyncClient, make_user, db_session
) -> None:
    _physician, headers = await _signed_in(make_user, "physician")
    bhw = await make_user("bhw")
    today = _today()
    p = await _patient(db_session, bhw.id)

    await _appointment(db_session, p, _at(today, 15), appointment_type="prenatal", status="confirmed")
    await _appointment(db_session, p, _at(today + timedelta(days=3)), appointment_type="follow_up")
    await _appointment(db_session, p, _at(today + timedelta(days=10)), appointment_type="follow_up")
    await _appointment(db_session, p, _at(today, 16), status="cancelled")
    await _dose(db_session, p, today + timedelta(days=2))
    await _dose(db_session, p, today + timedelta(days=2), status="cancelled")
    for name in ("URTI", "URTI", "Dengue"):
        db_session.add(MedicalHistory(id=uuid.uuid4(), patient_id=p.id, condition_name=name))
    await db_session.commit()

    body = (await client.get(URL, headers=headers)).json()

    # prenatal today + follow-up in 3 days + 1 scheduled dose (not day 10, not cancelled)
    assert body["follow_ups_due_7d"] == 3
    assert body["appointments_today_count"] == 1  # cancelled one excluded
    assert body["appointments_today"][0]["appointment_type"] == "prenatal"
    assert body["top_conditions_month"][0] == {"condition_name": "URTI", "count": 2}


# ---------------------------------------------------------------------------
# BHW
# ---------------------------------------------------------------------------


async def test_bhw_immunizations_due_and_overdue_by_sitio(
    client: AsyncClient, make_user, db_session
) -> None:
    bhw, headers = await _signed_in(make_user, "bhw")
    today = _today()
    p3 = await _patient(db_session, bhw.id, sitio_purok="Purok 3")
    p5 = await _patient(db_session, bhw.id, sitio_purok="Purok 5")

    late = await _dose(db_session, p3, today - timedelta(days=3))
    await _dose(db_session, p3, today + timedelta(days=2))
    await _dose(db_session, p5, today + timedelta(days=7))
    await _dose(db_session, p5, today + timedelta(days=8))  # outside the week
    await _dose(db_session, p5, today - timedelta(days=1), status="cancelled")
    await _dose(db_session, p5, today, status="completed")

    body = (await client.get(URL, headers=headers)).json()

    assert body["immunizations_due_7d"] == 2
    assert body["immunizations_overdue"] == 1
    rows = body["immunizations_due"]
    assert len(rows) == 3
    first = rows[0]  # overdue first
    assert first["id"] == str(late.id)
    assert first["overdue"] is True
    assert first["sitio_purok"] == "Purok 3"


async def test_bhw_missed_appointments_sms_drafts_cards_and_own_visits(
    client: AsyncClient, make_user, db_session
) -> None:
    bhw, headers = await _signed_in(make_user, "bhw")
    other_bhw = await make_user("bhw")
    today = _today()
    p = await _patient(db_session, bhw.id, first_name="Missed", last_name="Mother")
    carded = await _patient(db_session, bhw.id)
    gone = await _patient(db_session, bhw.id, is_active=False)

    await _appointment(db_session, p, _at(today - timedelta(days=2)), status="missed", appointment_type="prenatal")
    await _appointment(db_session, p, _at(today - timedelta(days=9)), status="missed")  # too old
    await _appointment(db_session, gone, _at(today - timedelta(days=1)), status="missed")  # inactive patient
    await _sms(db_session, p, "sent")
    await _sms(db_session, p, "delivered")
    failed = await _sms(db_session, p, "failed", error_detail="Invalid number")
    await _sms(db_session, p, "queued")
    await _draft(db_session)
    await _draft(db_session, with_data=False)  # QR printed but nothing filled in yet
    db_session.add(
        HealthCard(
            id=uuid.uuid4(), patient_id=carded.id, card_number=f"C-{uuid.uuid4().hex[:8]}",
            qr_payload_hash="x", status="active",
        )
    )
    await db_session.commit()
    await _visit(db_session, p, bhw.id, _at(today, 9))
    await _visit(db_session, p, other_bhw.id, _at(today, 9))
    await _visit(db_session, p, bhw.id, _at(today - timedelta(days=8), 9))

    body = (await client.get(URL, headers=headers)).json()

    assert body["missed_appointments_7d"] == 1
    assert body["missed_appointments"][0]["patient"]["full_name"] == "Missed Mother"
    assert body["missed_appointments"][0]["mobile_number"] == "+639170000001"
    assert body["sms_today_sent"] == 2
    assert body["sms_today_failed"] == 1
    assert body["failed_sms"][0]["id"] == str(failed.id)
    assert body["failed_sms"][0]["reason"] == "Invalid number"
    assert body["previsit_forms_waiting"] == 1
    assert body["visits_logged_by_me_week"] == 1
    # active patients without an active card: p (and none other active besides carded)
    assert body["patients_without_active_card"] == 1
    _no_clinical_text(body)


# ---------------------------------------------------------------------------
# Admin (model B)
# ---------------------------------------------------------------------------


async def test_admin_gets_system_and_registrations_never_clinical(
    client: AsyncClient, make_user, db_session
) -> None:
    admin, headers = await _signed_in(make_user, "admin")
    bhw = await make_user("bhw")
    p = await _patient(db_session, bhw.id)
    await _visit(db_session, p, bhw.id, _at(_today(), 9), temperature=39.0)
    await _application(db_session)
    await _application(db_session)
    await _application(db_session, status="approved")
    await _draft(db_session)

    body = (await client.get(URL, headers=headers)).json()

    assert body["role"] == "admin"
    assert body["system"]["overall"] in {"ok", "warning", "error", "unknown"}
    assert body["online_applications_pending"] == 2
    assert body["previsit_forms_waiting"] == 1
    assert body["recent_applications"][0]["applicant_name"] == "Online Applicant"
    assert body["active_patients"] >= 1
    assert body["staff"]["active"] >= 2
    assert isinstance(body["security_alerts"], list)
    for clinical in ("waiting", "consultations_today", "immunizations_due", "visits_logged_by_me_week"):
        assert clinical not in body
    assert "39.0" not in json.dumps(body)
    _no_clinical_text(body)


# ---------------------------------------------------------------------------
# Admin staff (front desk)
# ---------------------------------------------------------------------------


async def test_admin_staff_today_with_form_status(
    client: AsyncClient, make_user, db_session
) -> None:
    _staff, headers = await _signed_in(make_user, "admin_staff")
    bhw = await make_user("bhw")
    today = _today()
    p = await _patient(db_session, bhw.id)

    await _appointment(db_session, p, _at(today, 9), intake_completed=True)
    await _appointment(db_session, p, _at(today, 10))
    await _appointment(db_session, p, _at(today, 11), status="cancelled", intake_completed=True)
    await _appointment(db_session, p, _at(today + timedelta(days=1), 9))
    await _draft(db_session)

    body = (await client.get(URL, headers=headers)).json()

    assert body["appointments_today_count"] == 2
    assert body["intake_done_today"] == 1
    assert [a["intake_completed"] for a in body["appointments_today"]] == [True, False]
    assert body["appointments_tomorrow_count"] == 1
    assert body["previsit_forms_waiting"] == 1
    for not_theirs in ("sms_today_sent", "system", "waiting"):
        assert not_theirs not in body
