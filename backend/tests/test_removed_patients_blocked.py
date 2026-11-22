"""
No new visits, immunizations, medical history entries or bookings for
deactivated or archived patients.

Deactivate means "switched off for now" and Archive means "stored away", so
neither should take new clinical records or appointments until an Admin
switches them back on (Reactivate / Unarchive). Their existing records stay
readable.

Before this change only booking was blocked, and only for deactivated
patients: a visit or a vaccine dose could still be logged for either kind of
removed patient by opening the page directly, and archived patients could
still be booked.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import create_access_token
from app.models.appointment import Appointment
from app.models.immunization import Immunization
from app.models.medical_history import MedicalHistory
from app.models.patient import Patient
from app.models.sms_log import SmsLog
from app.models.visit import Visit
from app.services import patient_service
from tests.conftest import unique_mobile

pytestmark = pytest.mark.asyncio

INACTIVE_MSG = "The patient is inactive. Reactivate them on the Inactive Patients page first."
ARCHIVED_MSG = "The patient is archived. Restore them from the Patient Archive first."
MESSAGES = {"inactive": INACTIVE_MSG, "archived": ARCHIVED_MSG}

REMOVED = pytest.mark.parametrize("kind", ["inactive", "archived"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _headers(make_user: Any, role: str) -> dict[str, str]:
    user = await make_user(role)
    token = create_access_token(subject=str(user.id), role=role)
    return {"Authorization": f"Bearer {token}"}


async def _patient(db: AsyncSession, kind: str | None = None) -> Patient:
    fields: dict[str, Any] = {
        "id": uuid.uuid4(),
        "patient_code": f"RB-{uuid.uuid4().hex[:8].upper()}",
        "first_name": "Resa",
        "last_name": "Test",
        "birth_date": date(1990, 1, 1),
        "sex": "female",
        "address": "Barangay Test",
        "mobile_number": unique_mobile(),
        "is_active": True,
    }
    if kind == "inactive":
        fields["is_active"] = False
    elif kind == "archived":
        fields["archived_at"] = datetime.now(tz=UTC)
        fields["archive_reason"] = "Moved away"
    patient = Patient(**fields)
    db.add(patient)
    await db.commit()
    await db.refresh(patient)
    return patient


async def _count(db: AsyncSession, model: Any, patient_id: uuid.UUID) -> int:
    stmt = select(func.count()).select_from(model).where(model.patient_id == patient_id)
    return (await db.execute(stmt)).scalar_one()


def _visit_payload() -> dict[str, Any]:
    return {
        "visit_type": "consultation",
        "chief_complaint": "Headache",
        "vital_signs": {"blood_pressure": "120/80 mmHg", "temperature": 36.8},
    }


def _immunization_payload() -> dict[str, Any]:
    return {
        "vaccine_name": "BCG",
        "dose_number": 1,
        "status": "scheduled",
        "date_administered": str(date.today()),
        "next_due_date": str(date.today() + timedelta(days=30)),
    }


def _appointment_payload(patient_id: uuid.UUID) -> dict[str, Any]:
    return {
        "patient_id": str(patient_id),
        "appointment_type": "consultation",
        # 10:00 AM Manila in two days (inside clinic hours, 7 AM - 5 PM).
        "scheduled_at": (datetime.now(tz=UTC) + timedelta(days=2))
        .replace(hour=2, minute=0, second=0, microsecond=0)
        .isoformat(),
    }


def _error_message(resp: Any) -> str:
    body = resp.json()
    return str(body.get("error", {}).get("message") or body.get("detail"))


# ---------------------------------------------------------------------------
# The shared check
# ---------------------------------------------------------------------------


class TestRequirePatientInUse:
    async def test_active_patient_is_returned(self, db_session):
        patient = await _patient(db_session)
        found = await patient_service.require_patient_in_use(db_session, patient.id)
        assert found.id == patient.id

    @REMOVED
    async def test_removed_patient_is_refused_with_a_plain_reason(self, db_session, kind):
        patient = await _patient(db_session, kind)
        with pytest.raises(ConflictError) as exc:
            await patient_service.require_patient_in_use(db_session, patient.id)
        assert exc.value.message == MESSAGES[kind]

    async def test_unknown_patient_is_not_found(self, db_session):
        with pytest.raises(NotFoundError):
            await patient_service.require_patient_in_use(db_session, uuid.uuid4())

    async def test_inactive_and_archived_says_inactive_first(self, db_session):
        """Reactivate is the first thing to undo (archive has its own banner)."""
        patient = await _patient(db_session, "archived")
        patient.is_active = False
        await db_session.commit()
        with pytest.raises(ConflictError) as exc:
            await patient_service.require_patient_in_use(db_session, patient.id)
        assert exc.value.message == INACTIVE_MSG


# ---------------------------------------------------------------------------
# Visits
# ---------------------------------------------------------------------------


class TestVisits:
    async def test_active_patient_can_get_a_visit(self, client: AsyncClient, db_session, make_user):
        patient = await _patient(db_session)
        resp = await client.post(
            f"/api/v1/patients/{patient.id}/visits",
            json=_visit_payload(),
            headers=await _headers(make_user, "physician"),
        )
        assert resp.status_code == 201, resp.text

    @REMOVED
    async def test_no_new_visit(self, client: AsyncClient, db_session, make_user, kind):
        patient = await _patient(db_session, kind)
        resp = await client.post(
            f"/api/v1/patients/{patient.id}/visits",
            json=_visit_payload(),
            headers=await _headers(make_user, "bhw"),
        )
        assert resp.status_code == 409, resp.text
        assert _error_message(resp) == MESSAGES[kind]
        assert await _count(db_session, Visit, patient.id) == 0

    @REMOVED
    async def test_old_visits_stay_readable(self, client: AsyncClient, db_session, make_user, kind):
        patient = await _patient(db_session, kind)
        db_session.add(
            Visit(
                patient_id=patient.id,
                case_no=f"OLD-{uuid.uuid4().hex[:6]}",
                visit_date=datetime.now(tz=UTC) - timedelta(days=30),
                visit_type="consultation",
            )
        )
        await db_session.commit()
        resp = await client.get(
            f"/api/v1/patients/{patient.id}/visits",
            headers=await _headers(make_user, "physician"),
        )
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 1


# ---------------------------------------------------------------------------
# Immunizations
# ---------------------------------------------------------------------------


class TestImmunizations:
    async def test_active_patient_can_get_a_dose(self, client: AsyncClient, db_session, make_user):
        patient = await _patient(db_session)
        resp = await client.post(
            f"/api/v1/patients/{patient.id}/immunizations",
            json=_immunization_payload(),
            headers=await _headers(make_user, "bhw"),
        )
        assert resp.status_code == 201, resp.text

    @REMOVED
    async def test_no_new_dose(self, client: AsyncClient, db_session, make_user, kind):
        patient = await _patient(db_session, kind)
        resp = await client.post(
            f"/api/v1/patients/{patient.id}/immunizations",
            json=_immunization_payload(),
            headers=await _headers(make_user, "admin"),
        )
        assert resp.status_code == 409, resp.text
        assert _error_message(resp) == MESSAGES[kind]
        assert await _count(db_session, Immunization, patient.id) == 0

    @REMOVED
    async def test_old_doses_stay_readable(self, client: AsyncClient, db_session, make_user, kind):
        patient = await _patient(db_session, kind)
        db_session.add(
            Immunization(
                patient_id=patient.id,
                vaccine_name="BCG",
                dose_number=1,
                date_administered=date.today() - timedelta(days=60),
                status="completed",
            )
        )
        await db_session.commit()
        resp = await client.get(
            f"/api/v1/patients/{patient.id}/immunizations",
            headers=await _headers(make_user, "bhw"),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["total"] == 1


# ---------------------------------------------------------------------------
# Appointments
# ---------------------------------------------------------------------------


class TestAppointments:
    async def test_active_patient_can_be_booked(self, client: AsyncClient, db_session, make_user):
        patient = await _patient(db_session)
        resp = await client.post(
            "/api/v1/appointments",
            json=_appointment_payload(patient.id),
            headers=await _headers(make_user, "bhw"),
        )
        assert resp.status_code == 201, resp.text

    @REMOVED
    async def test_no_new_booking(self, client: AsyncClient, db_session, make_user, kind):
        patient = await _patient(db_session, kind)
        resp = await client.post(
            "/api/v1/appointments",
            json=_appointment_payload(patient.id),
            headers=await _headers(make_user, "admin"),
        )
        assert resp.status_code == 409, resp.text
        assert _error_message(resp) == MESSAGES[kind]
        assert await _count(db_session, Appointment, patient.id) == 0
        assert await _count(db_session, SmsLog, patient.id) == 0

    async def test_unknown_patient_is_404(self, client: AsyncClient, make_user):
        resp = await client.post(
            "/api/v1/appointments",
            json=_appointment_payload(uuid.uuid4()),
            headers=await _headers(make_user, "bhw"),
        )
        assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Medical history (Physician adds a condition)
# ---------------------------------------------------------------------------


class TestMedicalHistory:
    async def test_active_patient_can_get_an_entry(
        self, client: AsyncClient, db_session, make_user
    ):
        patient = await _patient(db_session)
        resp = await client.post(
            f"/api/v1/patients/{patient.id}/medical-history",
            json={"condition_name": "Hypertension"},
            headers=await _headers(make_user, "physician"),
        )
        assert resp.status_code == 201, resp.text

    @REMOVED
    async def test_no_new_entry(self, client: AsyncClient, db_session, make_user, kind):
        patient = await _patient(db_session, kind)
        resp = await client.post(
            f"/api/v1/patients/{patient.id}/medical-history",
            json={"condition_name": "Hypertension"},
            headers=await _headers(make_user, "physician"),
        )
        assert resp.status_code == 409, resp.text
        assert _error_message(resp) == MESSAGES[kind]
        assert await _count(db_session, MedicalHistory, patient.id) == 0


# ---------------------------------------------------------------------------
# Switching the patient back on lifts the block
# ---------------------------------------------------------------------------


async def test_reactivated_patient_can_get_a_visit_again(
    client: AsyncClient, db_session, make_user
):
    patient = await _patient(db_session, "inactive")
    admin = await _headers(make_user, "admin")
    resp = await client.post(f"/api/v1/patients/{patient.id}/reactivate", headers=admin)
    assert resp.status_code == 200, resp.text

    resp = await client.post(
        f"/api/v1/patients/{patient.id}/visits",
        json=_visit_payload(),
        headers=await _headers(make_user, "bhw"),
    )
    assert resp.status_code == 201, resp.text
