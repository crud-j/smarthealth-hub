"""
Patient domain service — all business logic for patient record management.

Responsibilities
----------------
- list_patients    Paginated search/filter with optional flags
- get_patient      Fetch by ID with NotFoundError on miss
- create_patient   Register a new patient: auto-generate patient_code, compute
                   is_senior, write CREATE audit log
- update_patient   Partial-update demographics; re-compute is_senior when
                   birth_date changes; write UPDATE audit log
- deactivate_patient  Soft-delete (is_active=False); write DELETE audit log
- verify_patient   Card-scan identity summary; write VIEW_PHI audit log

All audit logs are written within the same database transaction as the
primary operation.  If the audit write fails it is swallowed (never blocks
the clinical workflow) — see audit_service.write_audit_log.

Patient code format:  BHC-{YEAR}-{6-digit-zero-padded-seq}
  e.g. BHC-2026-000001

is_senior auto-rule:  True when age at registration time is ≥ 60.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.models.patient import Patient
from app.schemas.patient import (
    PatientCreate,
    PatientUpdate,
    PatientVerifySummary,
)
from app.services.audit_service import write_audit_log

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_PATIENT_CODE_RE = re.compile(r"^BHC-(\d{4})-(\d{6})$")


def _compute_age(birth_date: date) -> int:
    """Return age in whole years from birth_date to today."""
    today = date.today()
    return (
        today.year
        - birth_date.year
        - ((today.month, today.day) < (birth_date.month, birth_date.day))
    )


async def _next_patient_code(db: AsyncSession) -> str:
    """
    Generate the next patient_code by querying the current maximum sequence
    number for the current calendar year.

    Pattern: BHC-{YEAR}-{6-digit-seq}

    Falls back to sequence 1 if no patients exist for the current year.
    Uses a single SELECT MAX() query — safe for single-BHC deployment where
    concurrent registrations are rare; for high-concurrency deployments a
    PostgreSQL sequence would be preferable.
    """
    year = date.today().year
    prefix = f"BHC-{year}-"

    result = await db.execute(
        select(func.max(Patient.patient_code)).where(
            Patient.patient_code.like(f"{prefix}%")
        )
    )
    max_code: str | None = result.scalar_one_or_none()

    if max_code:
        match = _PATIENT_CODE_RE.match(max_code)
        seq = int(match.group(2)) + 1 if match else 1
    else:
        seq = 1

    return f"{prefix}{seq:06d}"


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def list_patients(
    db: AsyncSession,
    *,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
    is_senior: bool | None = None,
    is_pwd: bool | None = None,
    is_pregnant: bool | None = None,
    sort: str | None = None,
) -> tuple[list[Patient], int]:
    """
    Return a paginated list of active patients with optional text search and
    demographic-flag filters.

    Text search (``q``) is a case-insensitive LIKE match against:
      - last_name
      - first_name
      - patient_code
      - mobile_number

    Args:
        db:          Active async database session.
        q:           Optional free-text search string.
        page:        1-based page number.
        page_size:   Number of results per page (max enforced by caller).
        is_senior:   If not None, filter by is_senior flag.
        is_pwd:      If not None, filter by is_pwd flag.
        is_pregnant: If not None, filter by is_pregnant flag.
        sort:        Optional sort key. ``"created_at"`` orders newest-first
                     (used by the dashboard "Recently Registered Patients"
                     panel). Any other value (or None) preserves the default
                     alphabetical (last_name, first_name) ordering used by
                     the patient list/search UI.

    Returns:
        Tuple of (list of Patient ORM objects, total_count).
    """
    base_query = select(Patient).where(Patient.is_active.is_(True))

    if q:
        term = f"%{q}%"
        base_query = base_query.where(
            Patient.last_name.ilike(term)
            | Patient.first_name.ilike(term)
            | Patient.patient_code.ilike(term)
            | Patient.mobile_number.ilike(term)
        )
    if is_senior is not None:
        base_query = base_query.where(Patient.is_senior.is_(is_senior))
    if is_pwd is not None:
        base_query = base_query.where(Patient.is_pwd.is_(is_pwd))
    if is_pregnant is not None:
        base_query = base_query.where(Patient.is_pregnant.is_(is_pregnant))

    # Count query (same filters, no pagination)
    count_result = await db.execute(
        select(func.count()).select_from(base_query.subquery())
    )
    total: int = count_result.scalar_one()

    # Paginated fetch — default ordering is alphabetical (last_name, first_name);
    # sort="created_at" orders newest-registered-first for the dashboard panel.
    offset = (page - 1) * page_size
    order_by_clause = (
        (Patient.created_at.desc(),)
        if sort == "created_at"
        else (Patient.last_name, Patient.first_name)
    )
    paginated_query = (
        base_query
        .order_by(*order_by_clause)
        .offset(offset)
        .limit(page_size)
    )
    rows = await db.execute(paginated_query)
    patients: list[Patient] = list(rows.scalars().all())

    return patients, total


async def get_patient(db: AsyncSession, patient_id: uuid.UUID) -> Patient:
    """
    Fetch a patient by ID.

    Raises:
        NotFoundError: If no patient with the given ID exists (active or not).
    """
    result = await db.execute(
        select(Patient).where(Patient.id == patient_id)
    )
    patient: Patient | None = result.scalar_one_or_none()
    if patient is None:
        raise NotFoundError(f"Patient with ID {patient_id} was not found.")
    return patient


async def create_patient(
    db: AsyncSession,
    data: PatientCreate,
    created_by_id: uuid.UUID,
    ip_address: str | None = None,
    confirm_duplicate: bool = False,
) -> tuple[Patient | None, list[Patient]]:
    """
    Register a new patient.

    Duplicate detection matches same last_name + first_name + birth_date
    (case-insensitive) against active patients.

    Behaviour:
      - No duplicate found: registers normally. Returns ``(patient, [])``.
      - Duplicate found, ``confirm_duplicate=False`` (default): the record is
        NOT created. Returns ``(None, matches)`` so the caller (endpoint) can
        surface the match(es) to the registering user as a warning. The
        frontend re-submits the identical payload with
        ``confirm_duplicate=True`` to bypass — gated to the Admin role.
      - Duplicate found, ``confirm_duplicate=True``: the check is bypassed
        and registration proceeds, with an additional
        ``{"confirmed_duplicate": true}`` note in the CREATE audit log
        metadata so the override is traceable in the audit trail.

    Steps (on successful registration):
    1. Auto-generate a unique patient_code (BHC-YYYY-NNNNNN).
    2. Compute is_senior from birth_date (True if age >= 60).
    3. Persist the Patient row.
    4. Write a CREATE audit log entry.
    5. Flush and return the ORM instance.

    Returns:
        A ``(patient, matches)`` tuple where exactly one side is populated:
        ``(Patient, [])`` on success, or ``(None, [Patient, ...])`` when a
        duplicate warning was returned instead of creating a record.
    """
    # Duplicate detection: same last_name + first_name + birth_date (case-insensitive)
    dup_check = await db.execute(
        select(Patient).where(
            func.lower(Patient.last_name) == data.last_name.lower(),
            func.lower(Patient.first_name) == data.first_name.lower(),
            Patient.birth_date == data.birth_date,
            Patient.is_active.is_(True),
        )
    )
    matches: list[Patient] = list(dup_check.scalars().all())

    if matches and not confirm_duplicate:
        logger.info(
            "Duplicate patient warning returned (not confirmed)",
            extra={
                "name": f"{data.last_name}, {data.first_name}",
                "birth_date": str(data.birth_date),
                "match_count": len(matches),
            },
        )
        return None, matches

    patient_code = await _next_patient_code(db)
    age = _compute_age(data.birth_date)
    is_senior = age >= 60

    patient = Patient(
        patient_code=patient_code,
        first_name=data.first_name,
        middle_name=data.middle_name,
        last_name=data.last_name,
        birth_date=data.birth_date,
        sex=data.sex,
        civil_status=data.civil_status,
        mobile_number=data.mobile_number,
        address=data.address,
        guardian_name=data.guardian_name,
        guardian_contact=data.guardian_contact,
        philhealth_no=data.philhealth_no,
        philhealth_member_type=data.philhealth_member_type,
        is_pwd=data.is_pwd,
        is_senior=is_senior,
        is_pregnant=data.is_pregnant,
        is_active=True,
        created_by=created_by_id,
    )

    db.add(patient)
    await db.flush()  # assigns patient.id before audit log

    audit_metadata: dict[str, Any] = {
        "patient_code": patient_code,
        "name": f"{data.last_name}, {data.first_name}",
    }
    if matches and confirm_duplicate:
        audit_metadata["confirmed_duplicate"] = True
        audit_metadata["duplicate_of"] = [str(m.id) for m in matches]

    await write_audit_log(
        db=db,
        user_id=created_by_id,
        action="CREATE",
        entity_type="patient",
        entity_id=patient.id,
        metadata=audit_metadata,
        ip_address=ip_address,
    )

    await db.commit()
    await db.refresh(patient)

    logger.info(
        "Patient created",
        extra={
            "patient_code": patient_code,
            "created_by": str(created_by_id),
            "confirmed_duplicate": bool(matches and confirm_duplicate),
        },
    )
    return patient, []


async def update_patient(
    db: AsyncSession,
    patient_id: uuid.UUID,
    data: PatientUpdate,
    updated_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> Patient:
    """
    Partial-update patient demographics.

    Only fields explicitly set in ``data`` (i.e. not None) are updated.
    ``is_senior`` is re-computed if ``birth_date`` is changed.

    Raises:
        NotFoundError: If the patient does not exist.
    """
    patient = await get_patient(db, patient_id)

    update_fields: dict[str, Any] = {}
    for field, value in data.model_dump(exclude_none=True).items():
        update_fields[field] = value
        setattr(patient, field, value)

    # Re-compute is_senior if birth_date changed
    new_birth_date: date | None = data.birth_date
    if new_birth_date is not None:
        patient.is_senior = _compute_age(new_birth_date) >= 60
        update_fields["is_senior"] = patient.is_senior

    patient.updated_at = datetime.utcnow()  # type: ignore[assignment]

    await write_audit_log(
        db=db,
        user_id=updated_by_id,
        action="UPDATE",
        entity_type="patient",
        entity_id=patient_id,
        metadata={"changed_fields": list(update_fields.keys())},
        ip_address=ip_address,
    )

    await db.commit()
    await db.refresh(patient)
    return patient


async def deactivate_patient(
    db: AsyncSession,
    patient_id: uuid.UUID,
    by_id: uuid.UUID,
    ip_address: str | None = None,
) -> None:
    """
    Soft-delete a patient by setting ``is_active=False``.

    Data is never hard-deleted to preserve audit trail integrity.

    Raises:
        NotFoundError: If the patient does not exist.
    """
    patient = await get_patient(db, patient_id)
    patient.is_active = False
    patient.updated_at = datetime.utcnow()  # type: ignore[assignment]

    await write_audit_log(
        db=db,
        user_id=by_id,
        action="DELETE",
        entity_type="patient",
        entity_id=patient_id,
        metadata={"patient_code": patient.patient_code},
        ip_address=ip_address,
    )

    await db.commit()
    logger.info(
        "Patient deactivated",
        extra={"patient_id": str(patient_id), "by": str(by_id)},
    )


async def verify_patient(
    db: AsyncSession,
    patient_id: uuid.UUID,
    verified_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> PatientVerifySummary:
    """
    Return a minimal identity summary for the card-scan verification screen.

    Queries the patient record and their most recent visit and health-card
    status.  Writes a VIEW_PHI audit log entry.

    Raises:
        NotFoundError: If the patient does not exist.
    """
    from app.models.health_card import HealthCard  # avoid circular import
    from app.models.visit import Visit  # avoid circular import

    patient = await get_patient(db, patient_id)

    # Latest visit date
    latest_visit_result = await db.execute(
        select(func.max(Visit.visit_date)).where(Visit.patient_id == patient_id)
    )
    last_visit_date: datetime | None = latest_visit_result.scalar_one_or_none()

    # Health card status
    card_result = await db.execute(
        select(HealthCard.status).where(HealthCard.patient_id == patient_id)
    )
    card_status: str | None = card_result.scalar_one_or_none()

    age = _compute_age(patient.birth_date)
    parts = [patient.first_name]
    if patient.middle_name:
        parts.append(patient.middle_name)
    parts.append(patient.last_name)
    full_name = " ".join(parts)

    await write_audit_log(
        db=db,
        user_id=verified_by_id,
        action="VIEW_PHI",
        entity_type="patient",
        entity_id=patient_id,
        metadata={"trigger": "card_verify"},
        ip_address=ip_address,
    )

    await db.commit()

    return PatientVerifySummary(
        id=str(patient.id),
        patient_code=patient.patient_code,
        full_name=full_name,
        age=age,
        sex=patient.sex,
        is_senior=patient.is_senior,
        is_pwd=patient.is_pwd,
        is_pregnant=patient.is_pregnant,
        last_visit_date=last_visit_date,
        card_status=card_status,
    )
