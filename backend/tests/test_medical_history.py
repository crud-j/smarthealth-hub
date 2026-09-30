"""
Tests for medical history API endpoints.

Covers:
  GET  /patients/{patient_id}/medical-history                          — list entries
  POST /patients/{patient_id}/medical-history                          — add entry
  GET  /patients/{patient_id}/medical-history/{entry_id}              — single entry

RBAC findings (confirmed from endpoint + service):
  POST (add entry)       — Physician and Admin only (_PHI_READ guard)
  GET list               — Any authenticated role (no VIEW_PHI audit written)
  GET single entry       — Any authenticated role; VIEW_PHI audit always written

Encryption findings:
  ``notes`` column in MedicalHistory stores AES-256-GCM ciphertext (base64).
  The column name is ``notes`` (not ``encrypted_notes``).
  Ciphertext is a base64 string — guaranteed != plaintext and guaranteed non-empty.

Async mode: ``asyncio_mode = "auto"`` (pyproject.toml) — no @pytest.mark.asyncio.
DB isolation: SAVEPOINT pattern from conftest.py — nothing persists between tests.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.audit_log import AuditLog
from app.models.medical_history import MedicalHistory
from app.models.patient import Patient
from app.models.user import Role, User


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

BASE = "/api/v1"


def medical_history_url(patient_id: str | uuid.UUID) -> str:
    return f"{BASE}/patients/{patient_id}/medical-history"


def medical_history_entry_url(patient_id: str | uuid.UUID, entry_id: str | uuid.UUID) -> str:
    return f"{BASE}/patients/{patient_id}/medical-history/{entry_id}"


# ---------------------------------------------------------------------------
# Payload helper
# ---------------------------------------------------------------------------


def _mh_payload(**overrides: object) -> dict[str, object]:
    """Return a minimal valid POST medical-history payload with optional overrides."""
    base: dict[str, object] = {
        "condition_name": "Hypertension",
        "severity": "mild",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Local fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def physician_user(db_session: AsyncSession) -> tuple[User, str]:
    """Create a Physician user and return (user, token)."""
    role = Role(id=uuid.uuid4(), name="physician", permissions={})
    db_session.add(role)
    await db_session.commit()

    user = User(
        id=uuid.uuid4(),
        full_name="Test Physician",
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
async def admin_user(db_session: AsyncSession) -> tuple[User, str]:
    """Create an Admin user and return (user, token)."""
    role = Role(id=uuid.uuid4(), name="admin", permissions={})
    db_session.add(role)
    await db_session.commit()

    user = User(
        id=uuid.uuid4(),
        full_name="Test Admin",
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
        full_name="Test BHW",
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
async def admin_staff_user(db_session: AsyncSession) -> tuple[User, str]:
    """Create an Admin Staff user and return (user, token)."""
    role = Role(id=uuid.uuid4(), name="admin_staff", permissions={})
    db_session.add(role)
    await db_session.commit()

    user = User(
        id=uuid.uuid4(),
        full_name="Test Admin Staff",
        email=f"admin_staff_{uuid.uuid4().hex[:6]}@test.local",
        mobile_number=f"+6391500{abs(uuid.uuid4().int) % 100000:05d}",
        password_hash=hash_password("StaffPass1!"),
        role_id=role.id,
        is_active=True,
        mfa_enabled=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = create_access_token(subject=str(user.id), role="admin_staff")
    return user, token


@pytest_asyncio.fixture
async def sample_patient(
    db_session: AsyncSession,
    bhw_user: tuple[User, str],
) -> Patient:
    """Create and return a basic active patient."""
    user, _ = bhw_user
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"BHC-2026-{uuid.uuid4().hex[:6].upper()}",
        first_name="Maria",
        middle_name="Santos",
        last_name="Reyes",
        birth_date=date(1985, 3, 10),
        sex="female",
        address="123 Test Street, Manila",
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
# Helper: create a medical history entry via POST
# ---------------------------------------------------------------------------


async def _create_mh(
    client: AsyncClient,
    patient_id: uuid.UUID,
    token: str,
    **overrides: object,
) -> dict[str, object]:
    """POST a new medical history entry and assert 201. Return the response JSON."""
    resp = await client.post(
        medical_history_url(patient_id),
        json=_mh_payload(**overrides),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# GET /patients/{patient_id}/medical-history — list (no PHI)
# ---------------------------------------------------------------------------


async def test_list_medical_history_requires_auth(
    client: AsyncClient,
    sample_patient: Patient,
) -> None:
    """GET without Authorization header → 401."""
    resp = await client.get(medical_history_url(sample_patient.id))
    assert resp.status_code == 401


async def test_list_medical_history_bhw_can_list(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """BHW can list medical history entries (list endpoint is open to all authenticated roles)."""
    _, token = bhw_user
    resp = await client.get(
        medical_history_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "patient_id" in data
    assert "redacted" in data
    assert isinstance(data["items"], list)


async def test_list_medical_history_empty_for_new_patient(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """A newly created patient has no medical history entries."""
    _, token = bhw_user
    resp = await client.get(
        medical_history_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []
    assert data["redacted"] is False


# ---------------------------------------------------------------------------
# POST /patients/{patient_id}/medical-history — add entry
# ---------------------------------------------------------------------------


async def test_create_medical_history_success(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """POST with valid body by a physician → 201 with condition_name and severity in response."""
    _, token = physician_user
    resp = await client.post(
        medical_history_url(sample_patient.id),
        json=_mh_payload(condition_name="Type 2 Diabetes Mellitus", severity="moderate"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["condition_name"] == "Type 2 Diabetes Mellitus"
    assert data["severity"] == "moderate"
    assert data["patient_id"] == str(sample_patient.id)
    assert "id" in data
    assert "created_at" in data


async def test_create_medical_history_all_severity_values(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """All three valid severity enum values are accepted: mild, moderate, severe."""
    _, token = physician_user
    for severity in ("mild", "moderate", "severe"):
        resp = await client.post(
            medical_history_url(sample_patient.id),
            json=_mh_payload(condition_name=f"Condition-{severity}", severity=severity),
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201, f"severity={severity!r} returned {resp.status_code}: {resp.text}"
        assert resp.json()["severity"] == severity


async def test_create_medical_history_admin_can_create(
    client: AsyncClient,
    sample_patient: Patient,
    admin_user: tuple[User, str],
) -> None:
    """Admin role can also POST medical history entries → 201."""
    _, token = admin_user
    resp = await client.post(
        medical_history_url(sample_patient.id),
        json=_mh_payload(condition_name="Asthma", severity="mild"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["condition_name"] == "Asthma"


async def test_create_medical_history_bhw_forbidden(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """BHW role is NOT allowed to POST medical history entries → 403 Forbidden.
    Confirmed from endpoint: _PHI_READ = require_role("physician", "admin") only.
    """
    _, token = bhw_user
    resp = await client.post(
        medical_history_url(sample_patient.id),
        json=_mh_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_create_medical_history_admin_staff_forbidden(
    client: AsyncClient,
    sample_patient: Patient,
    admin_staff_user: tuple[User, str],
) -> None:
    """Admin Staff role is NOT allowed to POST medical history entries → 403 Forbidden.
    Confirmed from endpoint: _PHI_READ = require_role("physician", "admin") only.
    """
    _, token = admin_staff_user
    resp = await client.post(
        medical_history_url(sample_patient.id),
        json=_mh_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_create_medical_history_encrypts_notes(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
    db_session: AsyncSession,
) -> None:
    """POST with plaintext notes → the DB stores an encrypted value, NOT the plaintext.

    The ``notes`` column on MedicalHistory holds AES-256-GCM ciphertext formatted
    as base64(nonce[12] || ciphertext_and_gcm_tag).  It is guaranteed to differ from
    the original plaintext string.
    """
    _, token = physician_user
    plaintext_notes = "Patient has a family history of diabetes. Monitor HbA1c quarterly."

    resp = await client.post(
        medical_history_url(sample_patient.id),
        json=_mh_payload(
            condition_name="Type 2 Diabetes",
            notes=plaintext_notes,
        ),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    entry_id = uuid.UUID(resp.json()["id"])

    # Query the DB directly to read the raw stored value
    result = await db_session.execute(
        select(MedicalHistory).where(MedicalHistory.id == entry_id)
    )
    entry: MedicalHistory | None = result.scalar_one_or_none()
    assert entry is not None, "Medical history entry not found in DB"

    # The raw stored value must NOT be the plaintext — encryption is active
    raw_notes = entry.notes
    assert raw_notes is not None, "notes column is None — notes were not stored"
    assert raw_notes != plaintext_notes, (
        f"notes column stores plaintext instead of encrypted ciphertext: {raw_notes!r}"
    )
    # Ciphertext is longer than the plaintext (nonce + tag overhead)
    assert len(raw_notes) > 0


async def test_create_medical_history_notes_returned_decrypted_in_response(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """The POST response returns the notes field as decrypted plaintext (not ciphertext).

    The service decrypts before building the response so the physician sees the original text.
    """
    _, token = physician_user
    plaintext_notes = "Check lipid panel every 6 months."

    resp = await client.post(
        medical_history_url(sample_patient.id),
        json=_mh_payload(condition_name="Hyperlipidemia", notes=plaintext_notes),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    # Response notes must be the original plaintext (decrypted for physician)
    assert data["notes"] == plaintext_notes
    assert data["redacted"] is False


async def test_create_medical_history_writes_audit_log(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
    db_session: AsyncSession,
) -> None:
    """POST → 201 must write a CREATE audit log row with entity_type='medical_history'."""
    _, token = physician_user

    resp = await client.post(
        medical_history_url(sample_patient.id),
        json=_mh_payload(condition_name="Gout"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    entry_id = uuid.UUID(resp.json()["id"])

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == entry_id,
            AuditLog.action == "CREATE",
            AuditLog.entity_type == "medical_history",
        )
    )
    logs = result.scalars().all()
    assert len(logs) >= 1, "Expected a CREATE audit log entry for medical_history"


async def test_create_medical_history_invalid_severity_returns_422(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """POST with an invalid severity value → 422 Unprocessable Entity."""
    _, token = physician_user
    resp = await client.post(
        medical_history_url(sample_patient.id),
        json=_mh_payload(severity="critical"),  # not in enum
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


async def test_create_medical_history_missing_condition_name_returns_422(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """POST without the required condition_name field → 422."""
    _, token = physician_user
    resp = await client.post(
        medical_history_url(sample_patient.id),
        json={"severity": "mild"},  # missing required condition_name
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


async def test_create_medical_history_unauthenticated_returns_401(
    client: AsyncClient,
    sample_patient: Patient,
) -> None:
    """POST without Authorization header → 401."""
    resp = await client.post(
        medical_history_url(sample_patient.id),
        json=_mh_payload(),
    )
    assert resp.status_code == 401


async def test_create_medical_history_unknown_patient_returns_error(
    client: AsyncClient,
    physician_user: tuple[User, str],
) -> None:
    """POST to a non-existent patient_id → 404 Not Found."""
    _, token = physician_user
    fake_patient_id = uuid.uuid4()
    resp = await client.post(
        medical_history_url(fake_patient_id),
        json=_mh_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /patients/{patient_id}/medical-history/{entry_id} — single entry
# ---------------------------------------------------------------------------


async def test_get_medical_history_entry_physician_sees_notes(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """Physician can retrieve a single entry with decrypted notes."""
    _, token = physician_user
    plaintext_notes = "Controlled with ACE inhibitor. BP target <130/80."

    created = await _create_mh(
        client,
        sample_patient.id,
        token,
        condition_name="Hypertension",
        notes=plaintext_notes,
    )
    entry_id = created["id"]

    resp = await client.get(
        medical_history_entry_url(sample_patient.id, entry_id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # Physician must receive decrypted notes
    assert data["notes"] == plaintext_notes
    assert data["redacted"] is False
    assert data["condition_name"] == "Hypertension"


async def test_get_medical_history_entry_bhw_sees_redacted_notes(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
    bhw_user: tuple[User, str],
) -> None:
    """BHW accessing a single entry: notes are withheld (None) and redacted=True."""
    _, phys_token = physician_user
    _, bhw_token = bhw_user

    # Physician creates the entry with notes
    created = await _create_mh(
        client,
        sample_patient.id,
        phys_token,
        condition_name="Asthma",
        notes="Using salbutamol inhaler PRN.",
    )
    entry_id = created["id"]

    # BHW retrieves the single entry
    resp = await client.get(
        medical_history_entry_url(sample_patient.id, entry_id),
        headers={"Authorization": f"Bearer {bhw_token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # BHW must not see notes
    assert data["notes"] is None
    assert data["redacted"] is True
    assert data["condition_name"] == "Asthma"


async def test_get_medical_history_entry_writes_view_phi_audit(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
    db_session: AsyncSession,
) -> None:
    """GET single entry always writes a VIEW_PHI audit log row, regardless of role.

    Confirmed from medical_history_service.get_medical_history_entry: the service
    always calls write_audit_log(action='VIEW_PHI', entity_type='medical_history').
    """
    _, token = physician_user

    created = await _create_mh(
        client,
        sample_patient.id,
        token,
        condition_name="Chronic Kidney Disease",
    )
    entry_id = uuid.UUID(created["id"])

    # Access the single-entry endpoint
    resp = await client.get(
        medical_history_entry_url(sample_patient.id, entry_id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == entry_id,
            AuditLog.action == "VIEW_PHI",
            AuditLog.entity_type == "medical_history",
        )
    )
    logs = result.scalars().all()
    assert len(logs) >= 1, "Expected a VIEW_PHI audit log entry for medical_history single-entry access"


async def test_get_medical_history_entry_not_found_returns_404(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """GET single entry with a non-existent entry_id → 404."""
    _, token = physician_user
    resp = await client.get(
        medical_history_entry_url(sample_patient.id, uuid.uuid4()),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_list_medical_history_returns_created_record(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
    bhw_user: tuple[User, str],
) -> None:
    """After creating an entry, the list shows total >= 1 and the record appears."""
    _, phys_token = physician_user
    _, bhw_token = bhw_user

    await _create_mh(
        client,
        sample_patient.id,
        phys_token,
        condition_name="Osteoporosis",
        severity="moderate",
    )

    resp = await client.get(
        medical_history_url(sample_patient.id),
        headers={"Authorization": f"Bearer {bhw_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    condition_names = [item["condition_name"] for item in data["items"]]
    assert "Osteoporosis" in condition_names


async def test_list_medical_history_notes_never_in_list(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """Notes are NEVER included in the list view, even for physician.
    Each list item has a 'redacted' flag instead, never a 'notes' field.
    """
    _, token = physician_user

    await _create_mh(
        client,
        sample_patient.id,
        token,
        condition_name="Hypothyroidism",
        notes="On levothyroxine 50mcg daily.",
    )

    resp = await client.get(
        medical_history_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    for item in data["items"]:
        assert "notes" not in item, "List view must never include the notes field"
        assert "redacted" in item
