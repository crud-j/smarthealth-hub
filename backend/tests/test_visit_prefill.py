"""
Add Visit with less typing.

1. ``GET /patients/{id}/visits/prefill`` suggests the visit type and chief
   complaint from the patient's appointment **today** (Manila day) and the
   pre-visit intake form they filled in for it. Nothing is saved; staff check
   and adjust the form.
2. A BHW records the desk part of a visit (type, complaint, vital signs). The
   diagnosis and treatment notes are the Physician's (Admin model B: only the
   Physician reads them), so a BHW sending them is refused. The visit then
   shows up on the Physician's "waiting for diagnosis" list.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.audit_log import AuditLog
from app.models.intake_token import PatientIntakeToken
from app.models.patient import Patient
from app.models.visit import Visit
from app.services.visit_service import intake_chief_complaint
from tests.conftest import unique_mobile

pytestmark = pytest.mark.asyncio

MANILA = ZoneInfo("Asia/Manila")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _manila_today() -> date:
    return datetime.now(tz=UTC).astimezone(MANILA).date()


def _at_manila(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=MANILA)


async def _headers(make_user: Any, role: str) -> dict[str, str]:
    user = await make_user(role)
    token = create_access_token(subject=str(user.id), role=role)
    return {"Authorization": f"Bearer {token}"}


async def _patient(db: AsyncSession) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"VP-{uuid.uuid4().hex[:8].upper()}",
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


async def _appointment(
    db: AsyncSession,
    patient: Patient,
    when: datetime,
    appointment_type: str = "checkup",
    status: str = "pending",
) -> Appointment:
    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=patient.id,
        appointment_type=appointment_type,
        scheduled_at=when,
        status=status,
    )
    db.add(appt)
    await db.commit()
    return appt


async def _intake(
    db: AsyncSession,
    appt: Appointment,
    purpose: str,
    details: dict[str, Any] | None = None,
    draft: dict[str, Any] | None = None,
) -> None:
    db.add(
        PatientIntakeToken(
            token=uuid.uuid4(),
            appointment_id=appt.id,
            patient_id=appt.patient_id,
            expires_at=datetime.now(tz=UTC) + timedelta(days=1),
            draft_data=draft if draft is not None else {"visit_purpose": purpose},
            visit_purpose=purpose,
            purpose_details=details,
        )
    )
    await db.commit()


def _prefill_url(patient_id: uuid.UUID) -> str:
    return f"/api/v1/patients/{patient_id}/visits/prefill"


# ---------------------------------------------------------------------------
# Chief complaint text from the intake form
# ---------------------------------------------------------------------------


class TestIntakeChiefComplaint:
    def test_reason_symptoms_and_medicines(self):
        text = intake_chief_complaint(
            "Hypertension / BP",
            {
                "visit_purpose": "Hypertension / BP",
                "has_headache": True,
                "has_dizziness": True,
                "has_chest_pain": False,
                "is_on_medication": True,
                "current_medications": "Amlodipine 5 mg",
            },
        )
        assert text == (
            "Hypertension / BP. Reports: dizziness, headache. Medications: Amlodipine 5 mg."
        )

    def test_patient_words_and_duration(self):
        text = intake_chief_complaint(
            "General Consultation",
            {
                "chief_complaint": "Ubo at sipon",
                "duration_of_illness": "3 days",
                "has_fever": True,
            },
        )
        assert text == "General Consultation. Ubo at sipon. Reports: fever. Duration: 3 days."

    def test_others_uses_what_the_patient_typed(self):
        assert intake_chief_complaint("Others", None, "Masakit ang tuhod") == "Masakit ang tuhod."

    def test_nothing_to_say(self):
        assert intake_chief_complaint(None, None) is None
        assert intake_chief_complaint("  ", {}) is None


# ---------------------------------------------------------------------------
# GET /patients/{id}/visits/prefill
# ---------------------------------------------------------------------------


class TestPrefill:
    async def test_no_appointment_today_suggests_nothing(
        self, client: AsyncClient, db_session, make_user
    ):
        patient = await _patient(db_session)
        resp = await client.get(_prefill_url(patient.id), headers=await _headers(make_user, "bhw"))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["appointment_id"] is None
        assert body["visit_type"] is None
        assert body["chief_complaint"] is None

    @pytest.mark.parametrize(
        ("appointment_type", "visit_type"),
        [
            ("checkup", "consultation"),
            ("consultation", "consultation"),
            ("prenatal", "prenatal_checkup"),
            ("vaccination", "immunization_admin"),
            ("immunization", "immunization_admin"),
            ("follow_up", "follow_up"),
        ],
    )
    async def test_visit_type_from_todays_appointment(
        self, client: AsyncClient, db_session, make_user, appointment_type, visit_type
    ):
        patient = await _patient(db_session)
        appt = await _appointment(
            db_session, patient, _at_manila(_manila_today(), 9), appointment_type
        )
        resp = await client.get(_prefill_url(patient.id), headers=await _headers(make_user, "bhw"))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["appointment_id"] == str(appt.id)
        assert body["appointment_type"] == appointment_type
        assert body["visit_type"] == visit_type
        assert body["chief_complaint"] is None  # no intake form

    async def test_early_morning_counts_as_today_in_manila(
        self, client: AsyncClient, db_session, make_user
    ):
        """07:30 Manila is still the previous day in UTC."""
        patient = await _patient(db_session)
        appt = await _appointment(db_session, patient, _at_manila(_manila_today(), 7, 30))
        resp = await client.get(_prefill_url(patient.id), headers=await _headers(make_user, "bhw"))
        assert resp.json()["appointment_id"] == str(appt.id)

    @pytest.mark.parametrize("status", ["cancelled", "completed"])
    async def test_cancelled_or_completed_appointment_is_ignored(
        self, client: AsyncClient, db_session, make_user, status
    ):
        patient = await _patient(db_session)
        await _appointment(db_session, patient, _at_manila(_manila_today(), 9), status=status)
        resp = await client.get(_prefill_url(patient.id), headers=await _headers(make_user, "bhw"))
        assert resp.json()["appointment_id"] is None

    @pytest.mark.parametrize("days", [-1, 1])
    async def test_other_days_are_ignored(self, client: AsyncClient, db_session, make_user, days):
        patient = await _patient(db_session)
        await _appointment(
            db_session, patient, _at_manila(_manila_today() + timedelta(days=days), 10)
        )
        resp = await client.get(_prefill_url(patient.id), headers=await _headers(make_user, "bhw"))
        assert resp.json()["appointment_id"] is None

    async def test_earliest_appointment_of_the_day_wins(
        self, client: AsyncClient, db_session, make_user
    ):
        patient = await _patient(db_session)
        today = _manila_today()
        await _appointment(db_session, patient, _at_manila(today, 14), "follow_up")
        first = await _appointment(db_session, patient, _at_manila(today, 8), "prenatal")
        resp = await client.get(_prefill_url(patient.id), headers=await _headers(make_user, "bhw"))
        assert resp.json()["appointment_id"] == str(first.id)

    async def test_chief_complaint_from_the_intake_form_is_audited(
        self, client: AsyncClient, db_session, make_user
    ):
        patient = await _patient(db_session)
        appt = await _appointment(db_session, patient, _at_manila(_manila_today(), 9))
        await _intake(
            db_session,
            appt,
            "Hypertension / BP",
            {"visit_purpose": "Hypertension / BP", "has_headache": True},
        )
        resp = await client.get(
            _prefill_url(patient.id), headers=await _headers(make_user, "physician")
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["chief_complaint"] == "Hypertension / BP. Reports: headache."
        assert body["intake_visit_purpose"] == "Hypertension / BP"

        rows = await db_session.execute(
            select(AuditLog).where(
                AuditLog.entity_id == patient.id,
                AuditLog.action == "VIEW_PHI",
                AuditLog.entity_type == "visit_prefill",
            )
        )
        audit = rows.scalars().all()
        assert len(audit) == 1
        assert audit[0].metadata_["appointment_id"] == str(appt.id)

    async def test_others_text_comes_from_the_draft(
        self, client: AsyncClient, db_session, make_user
    ):
        patient = await _patient(db_session)
        appt = await _appointment(db_session, patient, _at_manila(_manila_today(), 9))
        await _intake(
            db_session,
            appt,
            "Others",
            None,
            draft={"visit_purpose": "Others", "visit_purpose_other": "Masakit ang tuhod"},
        )
        resp = await client.get(_prefill_url(patient.id), headers=await _headers(make_user, "bhw"))
        assert resp.json()["chief_complaint"] == "Masakit ang tuhod."

    async def test_unsubmitted_intake_link_is_ignored(
        self, client: AsyncClient, db_session, make_user
    ):
        """A link was sent but the patient never filled it in: no draft, no text."""
        patient = await _patient(db_session)
        appt = await _appointment(db_session, patient, _at_manila(_manila_today(), 9))
        db_session.add(
            PatientIntakeToken(
                token=uuid.uuid4(),
                appointment_id=appt.id,
                expires_at=datetime.now(tz=UTC) + timedelta(days=1),
            )
        )
        await db_session.commit()
        resp = await client.get(_prefill_url(patient.id), headers=await _headers(make_user, "bhw"))
        body = resp.json()
        assert body["appointment_id"] == str(appt.id)
        assert body["chief_complaint"] is None

    async def test_unknown_patient_is_404(self, client: AsyncClient, make_user):
        resp = await client.get(
            _prefill_url(uuid.uuid4()), headers=await _headers(make_user, "bhw")
        )
        assert resp.status_code == 404, resp.text

    @pytest.mark.parametrize("role", ["admin", "admin_staff"])
    async def test_only_staff_who_log_visits(
        self, client: AsyncClient, db_session, make_user, role
    ):
        patient = await _patient(db_session)
        resp = await client.get(_prefill_url(patient.id), headers=await _headers(make_user, role))
        assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# BHW records the desk part; diagnosis and treatment are the Physician's
# ---------------------------------------------------------------------------


def _visit_payload(**extra: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "visit_type": "consultation",
        "chief_complaint": "Headache",
        "vital_signs": {"blood_pressure": "140/90 mmHg", "temperature": 36.9},
    }
    payload.update(extra)
    return payload


async def _visit_count(db: AsyncSession, patient_id: uuid.UUID) -> int:
    stmt = select(func.count()).select_from(Visit).where(Visit.patient_id == patient_id)
    return (await db.execute(stmt)).scalar_one()


class TestBhwDeskVisit:
    async def test_bhw_logs_type_complaint_and_vitals(
        self, client: AsyncClient, db_session, make_user
    ):
        patient = await _patient(db_session)
        resp = await client.post(
            f"/api/v1/patients/{patient.id}/visits",
            json=_visit_payload(),
            headers=await _headers(make_user, "bhw"),
        )
        assert resp.status_code == 201, resp.text

    @pytest.mark.parametrize("field", ["diagnosis", "treatment_notes"])
    async def test_bhw_cannot_write_physician_fields(
        self, client: AsyncClient, db_session, make_user, field
    ):
        patient = await _patient(db_session)
        resp = await client.post(
            f"/api/v1/patients/{patient.id}/visits",
            json=_visit_payload(**{field: "Hypertension stage 1"}),
            headers=await _headers(make_user, "bhw"),
        )
        assert resp.status_code == 403, resp.text
        assert "Physician" in resp.json()["error"]["message"]
        assert await _visit_count(db_session, patient.id) == 0

    async def test_bhw_blank_physician_fields_are_fine(
        self, client: AsyncClient, db_session, make_user
    ):
        """Older forms send empty strings; those are not a diagnosis."""
        patient = await _patient(db_session)
        resp = await client.post(
            f"/api/v1/patients/{patient.id}/visits",
            json=_visit_payload(diagnosis="  ", treatment_notes=""),
            headers=await _headers(make_user, "bhw"),
        )
        assert resp.status_code == 201, resp.text

    async def test_physician_still_writes_the_diagnosis(
        self, client: AsyncClient, db_session, make_user
    ):
        patient = await _patient(db_session)
        resp = await client.post(
            f"/api/v1/patients/{patient.id}/visits",
            json=_visit_payload(diagnosis="Hypertension stage 1", treatment_notes="Low salt"),
            headers=await _headers(make_user, "physician"),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["diagnosis"] == "Hypertension stage 1"
