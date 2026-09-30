"""
Tests for the immunizations API endpoints.

Covers:
  GET    /patients/{patient_id}/immunizations                        — list records
  POST   /patients/{patient_id}/immunizations                        — create record
  PATCH  /patients/{patient_id}/immunizations/{immunization_id}      — partial update
  DELETE /patients/{patient_id}/immunizations/{immunization_id}      — hard delete (physician/admin)
  GET    /immunizations/due                                           — due/overdue list
  GET    /immunizations/due-summary                                   — due count summary
  GET    /immunizations                                               — cross-patient paginated list
  GET    /immunizations/stats                                         — aggregate stats

RBAC:
  GET endpoints         — any authenticated staff role
  POST / PATCH          — BHW, physician, admin, admin_staff
  DELETE                — physician, admin only  (BHW → 403)

Async mode: ``asyncio_mode = "auto"`` — no @pytest.mark.asyncio needed.
DB isolation: SAVEPOINT pattern from conftest.py — nothing persists between tests.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.audit_log import AuditLog
from app.models.patient import Patient
from app.models.user import Role, User


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

BASE = "/api/v1"


def patient_immunizations_url(patient_id: str | uuid.UUID) -> str:
    return f"{BASE}/patients/{patient_id}/immunizations"


def immunization_url(patient_id: str | uuid.UUID, immunization_id: str | uuid.UUID) -> str:
    return f"{BASE}/patients/{patient_id}/immunizations/{immunization_id}"


DUE_URL = f"{BASE}/immunizations/due"
DUE_SUMMARY_URL = f"{BASE}/immunizations/due-summary"
ALL_IMMUNIZATIONS_URL = f"{BASE}/immunizations"
STATS_URL = f"{BASE}/immunizations/stats"


# ---------------------------------------------------------------------------
# Payloads
# ---------------------------------------------------------------------------

def _immunization_payload(**overrides: object) -> dict[str, object]:
    """Return a minimal valid POST immunization payload with optional overrides."""
    base: dict[str, object] = {
        "vaccine_name": "BCG",
        "dose_number": 1,
        "status": "scheduled",
        "date_administered": str(date.today()),
        "next_due_date": str(date.today() + timedelta(days=30)),
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Local fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> tuple[User, str]:
    """Create an Admin user and return (user, token)."""
    role = Role(id=uuid.uuid4(), name="admin", permissions={})
    db_session.add(role)
    await db_session.commit()

    user = User(
        id=uuid.uuid4(),
        full_name="Admin User",
        email=f"admin_{uuid.uuid4().hex[:6]}@test.local",
        mobile_number=f"+6391800{abs(uuid.uuid4().int) % 100000:05d}",
        password_hash=hash_password("AdminPass1!"),
        role_id=role.id,
        is_active=True,
        mfa_enabled=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = create_access_token(subject=str(user.id), role="admin")
    return user, token


@pytest_asyncio.fixture
async def bhw_user(db_session: AsyncSession) -> tuple[User, str]:
    """Create a BHW user and return (user, token)."""
    role = Role(id=uuid.uuid4(), name="bhw", permissions={})
    db_session.add(role)
    await db_session.commit()

    user = User(
        id=uuid.uuid4(),
        full_name="BHW User",
        email=f"bhw_{uuid.uuid4().hex[:6]}@test.local",
        mobile_number=f"+6391700{abs(uuid.uuid4().int) % 100000:05d}",
        password_hash=hash_password("BhwPass1!"),
        role_id=role.id,
        is_active=True,
        mfa_enabled=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = create_access_token(subject=str(user.id), role="bhw")
    return user, token


@pytest_asyncio.fixture
async def physician_user(db_session: AsyncSession) -> tuple[User, str]:
    """Create a Physician user and return (user, token)."""
    role = Role(id=uuid.uuid4(), name="physician", permissions={})
    db_session.add(role)
    await db_session.commit()

    user = User(
        id=uuid.uuid4(),
        full_name="Physician User",
        email=f"physician_{uuid.uuid4().hex[:6]}@test.local",
        mobile_number=f"+6391600{abs(uuid.uuid4().int) % 100000:05d}",
        password_hash=hash_password("DocPass1!"),
        role_id=role.id,
        is_active=True,
        mfa_enabled=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = create_access_token(subject=str(user.id), role="physician")
    return user, token


@pytest_asyncio.fixture
async def sample_patient(
    db_session: AsyncSession,
    bhw_user: tuple[User, str],
) -> Patient:
    """Create and return a basic active patient owned by the BHW user."""
    user, _ = bhw_user
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"BHC-2026-{uuid.uuid4().hex[:6].upper()}",
        first_name="Rosa",
        middle_name="Dela",
        last_name="Cruz",
        birth_date=date(1990, 5, 15),
        sex="female",
        address="456 Test Street, Quezon City",
        mobile_number=f"+63917{abs(uuid.uuid4().int) % 10000000:07d}",
        is_active=True,
        is_senior=False,
        is_pwd=False,
        is_pregnant=False,
        created_by=user.id,
    )
    db_session.add(patient)
    await db_session.commit()
    await db_session.refresh(patient)
    return patient


# ---------------------------------------------------------------------------
# Helper: create an immunization via POST and return parsed JSON
# ---------------------------------------------------------------------------


async def _create_immunization(
    client: AsyncClient,
    patient_id: uuid.UUID,
    token: str,
    **overrides: object,
) -> dict[str, object]:
    """POST a new immunization record and assert 201. Return the response JSON."""
    resp = await client.post(
        patient_immunizations_url(patient_id),
        json=_immunization_payload(**overrides),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# GET /patients/{patient_id}/immunizations — list
# ---------------------------------------------------------------------------


async def test_list_immunizations_requires_auth(
    client: AsyncClient,
    sample_patient: Patient,
) -> None:
    """GET without Authorization header → 401."""
    resp = await client.get(patient_immunizations_url(sample_patient.id))
    assert resp.status_code == 401


async def test_list_immunizations_bhw_can_list(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """BHW role can list immunizations for any patient."""
    _, token = bhw_user
    resp = await client.get(
        patient_immunizations_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data
    assert isinstance(data["items"], list)


async def test_list_immunizations_empty_for_new_patient(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """A newly created patient has no immunization records."""
    _, token = bhw_user
    resp = await client.get(
        patient_immunizations_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


async def test_list_immunizations_returns_created_record(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """After creating one immunization, the list shows total=1 and the record."""
    _, token = bhw_user
    await _create_immunization(client, sample_patient.id, token, vaccine_name="OPV")

    resp = await client.get(
        patient_immunizations_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    vaccine_names = [item["vaccine_name"] for item in data["items"]]
    assert "OPV" in vaccine_names


async def test_list_immunizations_pagination(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """page_size=1 returns at most 1 item even when multiple records exist."""
    _, token = bhw_user
    # Create two records.
    await _create_immunization(client, sample_patient.id, token, vaccine_name="BCG")
    await _create_immunization(client, sample_patient.id, token, vaccine_name="OPV", dose_number=2)

    resp = await client.get(
        f"{patient_immunizations_url(sample_patient.id)}?page=1&page_size=1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["page"] == 1
    assert data["page_size"] == 1


# ---------------------------------------------------------------------------
# POST /patients/{patient_id}/immunizations — create
# ---------------------------------------------------------------------------


async def test_create_immunization_success(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """POST with valid payload returns 201 with the created record."""
    _, token = bhw_user
    payload = _immunization_payload(
        vaccine_name="Measles",
        dose_number=1,
        status="completed",
        date_administered=str(date.today()),
    )
    resp = await client.post(
        patient_immunizations_url(sample_patient.id),
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["vaccine_name"] == "Measles"
    assert data["dose_number"] == 1
    assert data["status"] == "completed"
    assert data["patient_id"] == str(sample_patient.id)
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


async def test_create_immunization_unauthenticated_returns_401(
    client: AsyncClient,
    sample_patient: Patient,
) -> None:
    """POST without Authorization header → 401."""
    resp = await client.post(
        patient_immunizations_url(sample_patient.id),
        json=_immunization_payload(),
    )
    assert resp.status_code == 401


async def test_create_immunization_writes_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """POST must write a CREATE audit log entry for the immunization."""
    _, token = bhw_user
    data = await _create_immunization(
        client, sample_patient.id, token, vaccine_name="DPT"
    )
    immunization_id = uuid.UUID(data["id"])  # type: ignore[arg-type]

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == immunization_id,
            AuditLog.action == "CREATE",
            AuditLog.entity_type == "immunization",
        )
    )
    logs = result.scalars().all()
    assert len(logs) >= 1


async def test_create_immunization_all_valid_statuses(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """Every valid status value is accepted by POST."""
    _, token = bhw_user
    for status in ("scheduled", "completed", "missed", "cancelled"):
        resp = await client.post(
            patient_immunizations_url(sample_patient.id),
            json=_immunization_payload(vaccine_name=f"Vaccine-{status}", status=status),
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201, f"status={status!r} returned {resp.status_code}: {resp.text}"
        assert resp.json()["status"] == status


async def test_create_immunization_invalid_status_returns_422(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """POST with an invalid status value → 422 Unprocessable Entity."""
    _, token = bhw_user
    resp = await client.post(
        patient_immunizations_url(sample_patient.id),
        json=_immunization_payload(status="pending"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


async def test_create_immunization_missing_vaccine_name_returns_422(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """POST without vaccine_name (required field) → 422."""
    _, token = bhw_user
    payload: dict[str, object] = {
        "dose_number": 1,
        "status": "scheduled",
    }
    resp = await client.post(
        patient_immunizations_url(sample_patient.id),
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


async def test_create_immunization_optional_fields_accepted(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """POST accepts optional fields: batch_number, notes."""
    _, token = bhw_user
    resp = await client.post(
        patient_immunizations_url(sample_patient.id),
        json=_immunization_payload(
            vaccine_name="Rotavirus",
            batch_number="LOT-2026-001",
            notes="Administered without adverse reaction.",
        ),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["batch_number"] == "LOT-2026-001"
    assert data["notes"] == "Administered without adverse reaction."


async def test_create_immunization_unknown_patient_returns_error(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """
    POST to a non-existent patient_id triggers a DB foreign-key violation.
    The exception handler returns 409 Conflict (integrity error).
    """
    _, token = bhw_user
    fake_patient_id = uuid.uuid4()
    resp = await client.post(
        patient_immunizations_url(fake_patient_id),
        json=_immunization_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )
    # FK violation → integrity error handler returns 409 Conflict
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# PATCH /patients/{patient_id}/immunizations/{immunization_id} — update
# ---------------------------------------------------------------------------


async def test_patch_immunization_bhw_can_update(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """BHW role can PATCH an immunization (partial update)."""
    _, token = bhw_user
    created = await _create_immunization(client, sample_patient.id, token)
    imm_id = created["id"]

    resp = await client.patch(
        immunization_url(sample_patient.id, imm_id),  # type: ignore[arg-type]
        json={"status": "completed", "batch_number": "BATCH-XYZ"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "completed"
    assert data["batch_number"] == "BATCH-XYZ"


async def test_patch_immunization_physician_can_update(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
    physician_user: tuple[User, str],
) -> None:
    """Physician role can PATCH an immunization record."""
    _, bhw_token = bhw_user
    _, phys_token = physician_user

    # BHW creates the record.
    created = await _create_immunization(client, sample_patient.id, bhw_token)
    imm_id = created["id"]

    # Physician updates it.
    resp = await client.patch(
        immunization_url(sample_patient.id, imm_id),  # type: ignore[arg-type]
        json={"status": "missed", "notes": "Patient did not show up."},
        headers={"Authorization": f"Bearer {phys_token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "missed"
    assert data["notes"] == "Patient did not show up."


async def test_patch_immunization_writes_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """PATCH must write an UPDATE audit log entry for the immunization."""
    _, token = bhw_user
    created = await _create_immunization(client, sample_patient.id, token, vaccine_name="HiB")
    imm_id = uuid.UUID(created["id"])  # type: ignore[arg-type]

    await client.patch(
        immunization_url(sample_patient.id, imm_id),
        json={"status": "completed"},
        headers={"Authorization": f"Bearer {token}"},
    )

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == imm_id,
            AuditLog.action == "UPDATE",
            AuditLog.entity_type == "immunization",
        )
    )
    logs = result.scalars().all()
    assert len(logs) >= 1


async def test_patch_immunization_unauthenticated_returns_401(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """PATCH without Authorization header → 401."""
    _, token = bhw_user
    created = await _create_immunization(client, sample_patient.id, token)
    imm_id = created["id"]

    resp = await client.patch(
        immunization_url(sample_patient.id, imm_id),  # type: ignore[arg-type]
        json={"status": "completed"},
    )
    assert resp.status_code == 401


async def test_patch_immunization_not_found_returns_404(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """PATCH on a non-existent immunization_id → 404."""
    _, token = bhw_user
    resp = await client.patch(
        immunization_url(sample_patient.id, uuid.uuid4()),
        json={"status": "completed"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_patch_immunization_invalid_status_returns_422(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """PATCH with invalid status value → 422."""
    _, token = bhw_user
    created = await _create_immunization(client, sample_patient.id, token)
    imm_id = created["id"]

    resp = await client.patch(
        immunization_url(sample_patient.id, imm_id),  # type: ignore[arg-type]
        json={"status": "invalid_status"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# DELETE /patients/{patient_id}/immunizations/{immunization_id}
# ---------------------------------------------------------------------------


async def test_delete_immunization_physician_can_delete(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
    physician_user: tuple[User, str],
) -> None:
    """Physician role can DELETE an immunization record → 204 No Content."""
    _, bhw_token = bhw_user
    _, phys_token = physician_user

    created = await _create_immunization(client, sample_patient.id, bhw_token)
    imm_id = created["id"]

    resp = await client.delete(
        immunization_url(sample_patient.id, imm_id),  # type: ignore[arg-type]
        headers={"Authorization": f"Bearer {phys_token}"},
    )
    assert resp.status_code == 204


async def test_delete_immunization_admin_can_delete(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
    admin_user: tuple[User, str],
) -> None:
    """Admin role can DELETE an immunization record → 204 No Content."""
    _, bhw_token = bhw_user
    _, admin_token = admin_user

    created = await _create_immunization(client, sample_patient.id, bhw_token)
    imm_id = created["id"]

    resp = await client.delete(
        immunization_url(sample_patient.id, imm_id),  # type: ignore[arg-type]
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204


async def test_delete_immunization_bhw_role_returns_403(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """BHW role is NOT allowed to DELETE — must return 403 Forbidden."""
    _, token = bhw_user
    created = await _create_immunization(client, sample_patient.id, token)
    imm_id = created["id"]

    resp = await client.delete(
        immunization_url(sample_patient.id, imm_id),  # type: ignore[arg-type]
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_delete_immunization_writes_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
    admin_user: tuple[User, str],
) -> None:
    """DELETE must write a DELETE audit log entry for the immunization."""
    _, bhw_token = bhw_user
    _, adm_token = admin_user

    created = await _create_immunization(client, sample_patient.id, bhw_token, vaccine_name="IPV")
    imm_id = uuid.UUID(created["id"])  # type: ignore[arg-type]

    resp = await client.delete(
        immunization_url(sample_patient.id, imm_id),
        headers={"Authorization": f"Bearer {adm_token}"},
    )
    assert resp.status_code == 204

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == imm_id,
            AuditLog.action == "DELETE",
            AuditLog.entity_type == "immunization",
        )
    )
    logs = result.scalars().all()
    assert len(logs) >= 1


async def test_delete_immunization_unauthenticated_returns_401(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """DELETE without Authorization header → 401."""
    _, token = bhw_user
    created = await _create_immunization(client, sample_patient.id, token)
    imm_id = created["id"]

    resp = await client.delete(
        immunization_url(sample_patient.id, imm_id),  # type: ignore[arg-type]
    )
    assert resp.status_code == 401


async def test_delete_immunization_not_found_returns_404(
    client: AsyncClient,
    sample_patient: Patient,
    admin_user: tuple[User, str],
) -> None:
    """DELETE on a non-existent immunization_id → 404."""
    _, token = admin_user
    resp = await client.delete(
        immunization_url(sample_patient.id, uuid.uuid4()),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_delete_immunization_then_not_visible_in_list(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
    admin_user: tuple[User, str],
) -> None:
    """After deletion, the record no longer appears in the list for the patient."""
    _, bhw_token = bhw_user
    _, adm_token = admin_user

    created = await _create_immunization(
        client, sample_patient.id, bhw_token, vaccine_name="Varicella"
    )
    imm_id = created["id"]

    # Delete it.
    del_resp = await client.delete(
        immunization_url(sample_patient.id, imm_id),  # type: ignore[arg-type]
        headers={"Authorization": f"Bearer {adm_token}"},
    )
    assert del_resp.status_code == 204

    # Verify it's gone from the list.
    list_resp = await client.get(
        patient_immunizations_url(sample_patient.id),
        headers={"Authorization": f"Bearer {bhw_token}"},
    )
    assert list_resp.status_code == 200
    ids_in_list = [item["id"] for item in list_resp.json()["items"]]
    assert imm_id not in ids_in_list


# ---------------------------------------------------------------------------
# GET /immunizations/due — due / overdue list
# ---------------------------------------------------------------------------


async def test_list_due_immunizations_requires_auth(
    client: AsyncClient,
) -> None:
    """GET /immunizations/due without Authorization header → 401."""
    resp = await client.get(DUE_URL)
    assert resp.status_code == 401


async def test_list_due_immunizations_returns_200(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """GET /immunizations/due with any valid token returns 200 and a list."""
    _, token = bhw_user
    resp = await client.get(
        DUE_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_list_due_immunizations_includes_overdue_record(
    client: AsyncClient,
    db_session: AsyncSession,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """
    An immunization with status='scheduled' and next_due_date in the past
    must appear in the /immunizations/due response.
    """
    _, token = bhw_user
    # Create a record that is already overdue (next_due_date = yesterday).
    overdue_date = (date.today() - timedelta(days=1)).isoformat()
    created = await _create_immunization(
        client,
        sample_patient.id,
        token,
        vaccine_name="Overdue-Vaccine",
        status="scheduled",
        next_due_date=overdue_date,
    )
    imm_id = created["id"]

    resp = await client.get(
        DUE_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    due_ids = [item["id"] for item in resp.json()]
    assert imm_id in due_ids


async def test_list_due_immunizations_excludes_completed_record(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """
    Completed immunizations must NOT appear in the /immunizations/due list,
    even if next_due_date is in the past.
    """
    _, token = bhw_user
    past_date = (date.today() - timedelta(days=5)).isoformat()
    created = await _create_immunization(
        client,
        sample_patient.id,
        token,
        vaccine_name="Completed-Vaccine",
        status="completed",
        next_due_date=past_date,
    )
    imm_id = created["id"]

    resp = await client.get(
        DUE_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    due_ids = [item["id"] for item in resp.json()]
    assert imm_id not in due_ids


async def test_list_due_immunizations_days_ahead_parameter(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """
    ?days_ahead=0 should return only records due today or overdue.
    A record due in 5 days must not appear with days_ahead=0.
    """
    _, token = bhw_user
    # Record due in 5 days — should NOT appear with days_ahead=0.
    future_date = (date.today() + timedelta(days=5)).isoformat()
    created_future = await _create_immunization(
        client,
        sample_patient.id,
        token,
        vaccine_name="FutureVaccine",
        status="scheduled",
        next_due_date=future_date,
    )
    future_id = created_future["id"]

    # Record due today — SHOULD appear.
    today_str = str(date.today())
    created_today = await _create_immunization(
        client,
        sample_patient.id,
        token,
        vaccine_name="TodayVaccine",
        status="scheduled",
        next_due_date=today_str,
    )
    today_id = created_today["id"]

    resp = await client.get(
        f"{DUE_URL}?days_ahead=0",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    due_ids = [item["id"] for item in resp.json()]
    assert today_id in due_ids
    assert future_id not in due_ids


# ---------------------------------------------------------------------------
# GET /immunizations/due-summary
# ---------------------------------------------------------------------------


async def test_due_summary_returns_correct_shape(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """GET /immunizations/due-summary returns {due_this_week, due_this_month}."""
    _, token = bhw_user
    resp = await client.get(
        DUE_SUMMARY_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "due_this_week" in data
    assert "due_this_month" in data
    assert isinstance(data["due_this_week"], int)
    assert isinstance(data["due_this_month"], int)
    # Week count must not exceed month count.
    assert data["due_this_week"] <= data["due_this_month"]


async def test_due_summary_counts_scheduled_records(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """Creating a scheduled record with next_due_date in next 7 days increments due_this_week."""
    _, token = bhw_user

    before_resp = await client.get(
        DUE_SUMMARY_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    before = before_resp.json()["due_this_week"]

    # Create a record due in 3 days.
    due_soon = (date.today() + timedelta(days=3)).isoformat()
    await _create_immunization(
        client,
        sample_patient.id,
        token,
        vaccine_name="SummaryVaccine",
        status="scheduled",
        next_due_date=due_soon,
    )

    after_resp = await client.get(
        DUE_SUMMARY_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    after = after_resp.json()["due_this_week"]
    assert after == before + 1


# ---------------------------------------------------------------------------
# GET /immunizations — cross-patient list
# ---------------------------------------------------------------------------


async def test_list_all_immunizations_returns_200(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """GET /immunizations returns 200 with paginated shape."""
    _, token = bhw_user
    resp = await client.get(
        ALL_IMMUNIZATIONS_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data


async def test_list_all_immunizations_includes_patient_name(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """Each item in GET /immunizations includes patient_name."""
    _, token = bhw_user
    await _create_immunization(
        client, sample_patient.id, token, vaccine_name="CrossPatient-Test"
    )

    resp = await client.get(
        ALL_IMMUNIZATIONS_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    for item in data["items"]:
        assert "patient_name" in item


async def test_list_all_immunizations_filter_by_vaccine_name(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """?vaccine_name= filters to only matching records."""
    _, token = bhw_user
    await _create_immunization(
        client, sample_patient.id, token, vaccine_name="UniqueVaccineXYZ"
    )
    await _create_immunization(
        client, sample_patient.id, token, vaccine_name="OtherVaccine"
    )

    resp = await client.get(
        f"{ALL_IMMUNIZATIONS_URL}?vaccine_name=UniqueVaccineXYZ",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    for item in data["items"]:
        assert item["vaccine_name"] == "UniqueVaccineXYZ"


# ---------------------------------------------------------------------------
# GET /immunizations/stats
# ---------------------------------------------------------------------------


async def test_immunization_stats_returns_correct_shape(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """GET /immunizations/stats returns {total_records, distinct_vaccines}."""
    _, token = bhw_user
    resp = await client.get(
        STATS_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "total_records" in data
    assert "distinct_vaccines" in data
    assert isinstance(data["total_records"], int)
    assert isinstance(data["distinct_vaccines"], int)


async def test_immunization_stats_increments_on_create(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """Creating a new immunization record increments total_records by 1."""
    _, token = bhw_user

    before_resp = await client.get(STATS_URL, headers={"Authorization": f"Bearer {token}"})
    before_total = before_resp.json()["total_records"]

    await _create_immunization(client, sample_patient.id, token, vaccine_name="StatsTest")

    after_resp = await client.get(STATS_URL, headers={"Authorization": f"Bearer {token}"})
    after_total = after_resp.json()["total_records"]

    assert after_total == before_total + 1
