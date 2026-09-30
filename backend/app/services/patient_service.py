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
from datetime import UTC, date, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.models.patient import Patient
from app.schemas.patient import (
    PatientCreate,
    PatientUpdate,
    PatientVerifySummary,
)
from app.services.analytics_service import _invalidate_analytics_cache
from app.services.audit_service import write_audit_log
from app.utils.encryption import decrypt_text, encrypt_text

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
        sa.select(sa.func.max(Patient.patient_code)).where(Patient.patient_code.like(f"{prefix}%"))
    )
    max_code: str | None = result.scalar_one_or_none()

    if max_code:
        match = _PATIENT_CODE_RE.match(max_code)
        seq = int(match.group(2)) + 1 if match else 1
    else:
        seq = 1

    return f"{prefix}{seq:06d}"


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _compose_address(
    *,
    address: str | None,
    sitio_purok: str | None = None,
    barangay: str | None = None,
    municipality: str | None = None,
    province: str | None = None,
) -> str:
    structured_parts = [sitio_purok, barangay, municipality, province]
    cleaned_structured = [part.strip() for part in structured_parts if part and part.strip()]
    if cleaned_structured:
        return ", ".join(cleaned_structured)
    cleaned_address = _clean_text(address)
    return cleaned_address or ""


def _encrypt_optional_text(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if cleaned is None:
        return None
    return encrypt_text(cleaned)


def _decrypt_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    return decrypt_text(value)


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
    include_archived: bool = False,
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
        is_senior:        If not None, filter by is_senior flag.
        is_pwd:           If not None, filter by is_pwd flag.
        is_pregnant:      If not None, filter by is_pregnant flag.
        sort:             Optional sort key. ``"created_at"`` orders newest-first
                          (used by the dashboard "Recently Registered Patients"
                          panel). Any other value (or None) preserves the default
                          alphabetical (last_name, first_name) ordering used by
                          the patient list/search UI.
        include_archived: If True, include archived patients in results (Admin
                          override). Defaults to False (archived excluded).

    Returns:
        Tuple of (list of Patient ORM objects, total_count).
    """
    base_query = sa.select(Patient).where(Patient.is_active.is_(True))

    # Exclude archived patients unless caller explicitly opts in
    if not include_archived:
        base_query = base_query.where(Patient.archived_at.is_(None))

    if q:
        term = f"%{q}%"
        base_query = base_query.where(
            Patient.last_name.ilike(term)
            | Patient.first_name.ilike(term)
            | Patient.patient_code.ilike(term)
            | Patient.mobile_number.ilike(term)
            | Patient.philhealth_no.ilike(term)
            | Patient.address.ilike(term)
            | sa.cast(Patient.birth_date, sa.String).ilike(term)
        )
    if is_senior is not None:
        base_query = base_query.where(Patient.is_senior.is_(is_senior))
    if is_pwd is not None:
        base_query = base_query.where(Patient.is_pwd.is_(is_pwd))
    if is_pregnant is not None:
        base_query = base_query.where(Patient.is_pregnant.is_(is_pregnant))

    # Count query (same filters, no pagination)
    count_result = await db.execute(sa.select(sa.func.count()).select_from(base_query.subquery()))
    total: int = count_result.scalar_one()

    # Paginated fetch — default ordering is alphabetical (last_name, first_name);
    # sort="created_at" orders newest-registered-first for the dashboard panel.
    offset = (page - 1) * page_size
    order_by_clause = (
        (Patient.created_at.desc(),)
        if sort == "created_at"
        else (Patient.last_name, Patient.first_name)
    )
    paginated_query = base_query.order_by(*order_by_clause).offset(offset).limit(page_size)
    rows = await db.execute(paginated_query)
    patients: list[Patient] = list(rows.scalars().all())

    return patients, total


async def get_patient(db: AsyncSession, patient_id: uuid.UUID) -> Patient:
    """
    Fetch a patient by ID.

    Raises:
        NotFoundError: If no patient with the given ID exists (active or not).
    """
    result = await db.execute(sa.select(Patient).where(Patient.id == patient_id))
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
    duplicate_filters: list[Any] = [
        sa.and_(
            sa.func.lower(Patient.last_name) == data.last_name.lower(),
            sa.func.lower(Patient.first_name) == data.first_name.lower(),
            Patient.birth_date == data.birth_date,
        )
    ]
    if data.mobile_number:
        duplicate_filters.append(sa.func.lower(Patient.mobile_number) == data.mobile_number.lower())
    if data.philhealth_no:
        duplicate_filters.append(sa.func.lower(Patient.philhealth_no) == data.philhealth_no.lower())

    dup_check = await db.execute(
        sa.select(Patient).where(
            Patient.is_active.is_(True),
            sa.or_(*duplicate_filters),
        )
    )
    matches: list[Patient] = list(dup_check.scalars().all())

    if matches and not confirm_duplicate:
        logger.info(
            "Duplicate patient warning returned (not confirmed)",
            extra={
                "patient_name": f"{data.last_name}, {data.first_name}",
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
        household_number=data.household_number,
        sitio_purok=data.sitio_purok,
        barangay=data.barangay,
        municipality=data.municipality,
        province=data.province,
        occupation=data.occupation,
        mobile_number=data.mobile_number,
        address=_compose_address(
            address=data.address,
            sitio_purok=data.sitio_purok,
            barangay=data.barangay,
            municipality=data.municipality,
            province=data.province,
        ),
        guardian_name=data.guardian_name,
        guardian_contact=data.guardian_contact,
        emergency_contact_name=data.emergency_contact_name,
        emergency_contact_number=data.emergency_contact_number,
        philhealth_no=data.philhealth_no,
        philhealth_member_type=data.philhealth_member_type,
        philhealth_category=data.philhealth_category,
        is_4ps_beneficiary=data.is_4ps_beneficiary,
        household_id_4ps=data.household_id_4ps,
        is_indigenous=data.is_indigenous,
        place_of_birth=data.place_of_birth,
        mothers_maiden_name=data.mothers_maiden_name,
        is_pwd=data.is_pwd,
        is_senior=is_senior,
        is_pregnant=data.is_pregnant,
        is_active=True,
        blood_type=data.blood_type,
        senior_id_number=data.senior_id_number,
        pwd_id_number=data.pwd_id_number,
        last_menstrual_period=data.last_menstrual_period,
        gravida=data.gravida,
        para=data.para,
        estimated_due_date=data.estimated_due_date,
        height_cm=data.height_cm,
        weight_kg=data.weight_kg,
        allergies=_encrypt_optional_text(data.allergies),
        known_conditions=_encrypt_optional_text(data.known_conditions),
        registration_source=data.registration_source,
        registration_data_source=data.registration_data_source,
        data_privacy_consent=data.data_privacy_consent,
        data_privacy_consent_at=datetime.now(UTC),
        created_by=created_by_id,
    )

    db.add(patient)
    await db.flush()  # assigns patient.id before audit log

    audit_metadata: dict[str, Any] = {
        "patient_code": patient_code,
        "name": f"{data.last_name}, {data.first_name}",
        "data_privacy_consent": data.data_privacy_consent,
        "registration_data_source": data.registration_data_source,
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
    await _invalidate_analytics_cache()

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
        if field == "allergies":
            stored_value = _encrypt_optional_text(value)
        elif field == "known_conditions":
            stored_value = _encrypt_optional_text(value)
        elif field == "address":
            stored_value = _compose_address(address=value)
        else:
            stored_value = value
        update_fields[field] = stored_value
        setattr(patient, field, stored_value)

    if any(
        field in update_fields
        for field in ("sitio_purok", "barangay", "municipality", "province", "address")
    ):
        patient.address = _compose_address(
            address=update_fields.get("address", patient.address),
            sitio_purok=patient.sitio_purok,
            barangay=patient.barangay,
            municipality=patient.municipality,
            province=patient.province,
        )
        update_fields["address"] = patient.address

    # Re-compute is_senior if birth_date changed
    new_birth_date: date | None = data.birth_date
    if new_birth_date is not None:
        patient.is_senior = _compute_age(new_birth_date) >= 60
        update_fields["is_senior"] = patient.is_senior

    if data.data_privacy_consent is True:
        patient.data_privacy_consent = True
        patient.data_privacy_consent_at = datetime.now(UTC)
        update_fields["data_privacy_consent"] = True
        update_fields["data_privacy_consent_at"] = patient.data_privacy_consent_at

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
    await _invalidate_analytics_cache()
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


async def archive_patient(
    db: AsyncSession,
    patient_id: uuid.UUID,
    archived_by_id: uuid.UUID,
    reason: str,
    ip_address: str | None = None,
) -> Patient:
    """
    Archive a patient — sets archived_at / archived_by / archive_reason.

    Archived patients are excluded from the default list/search but all
    clinical records are preserved and can be accessed by Admins.

    Raises:
        NotFoundError: If the patient does not exist.
        ValueError:    If the patient is already archived.
    """
    patient = await get_patient(db, patient_id)

    if patient.archived_at is not None:
        raise ValueError(f"Patient {patient.patient_code} is already archived.")

    patient.archived_at = datetime.now(UTC)
    patient.archived_by = archived_by_id
    patient.archive_reason = reason.strip()
    patient.updated_at = datetime.now(UTC)  # type: ignore[assignment]

    await write_audit_log(
        db=db,
        user_id=archived_by_id,
        action="ARCHIVE",
        entity_type="patient",
        entity_id=patient_id,
        metadata={
            "patient_code": patient.patient_code,
            "reason": reason,
        },
        ip_address=ip_address,
    )

    await db.commit()
    await db.refresh(patient)
    await _invalidate_analytics_cache()

    logger.info(
        "Patient archived",
        extra={
            "patient_id": str(patient_id),
            "patient_code": patient.patient_code,
            "by": str(archived_by_id),
        },
    )
    return patient


async def unarchive_patient(
    db: AsyncSession,
    patient_id: uuid.UUID,
    unarchived_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> Patient:
    """
    Unarchive (restore) a patient — clears archived_at / archived_by / archive_reason.

    Raises:
        NotFoundError: If the patient does not exist.
        ValueError:    If the patient is not currently archived.
    """
    patient = await get_patient(db, patient_id)

    if patient.archived_at is None:
        raise ValueError(f"Patient {patient.patient_code} is not currently archived.")

    previous_reason = patient.archive_reason
    patient.archived_at = None
    patient.archived_by = None
    patient.archive_reason = None
    patient.updated_at = datetime.now(UTC)  # type: ignore[assignment]

    await write_audit_log(
        db=db,
        user_id=unarchived_by_id,
        action="UNARCHIVE",
        entity_type="patient",
        entity_id=patient_id,
        metadata={
            "patient_code": patient.patient_code,
            "previous_reason": previous_reason,
        },
        ip_address=ip_address,
    )

    await db.commit()
    await db.refresh(patient)
    await _invalidate_analytics_cache()

    logger.info(
        "Patient unarchived",
        extra={
            "patient_id": str(patient_id),
            "patient_code": patient.patient_code,
            "by": str(unarchived_by_id),
        },
    )
    return patient


async def list_archived_patients(
    db: AsyncSession,
    *,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Patient], int]:
    """
    Return a paginated list of archived patients.

    Text search (``q``) matches last_name, first_name, patient_code, or
    mobile_number — same logic as list_patients.
    """
    base_query = sa.select(Patient).where(Patient.archived_at.is_not(None))

    if q:
        term = f"%{q}%"
        base_query = base_query.where(
            Patient.last_name.ilike(term)
            | Patient.first_name.ilike(term)
            | Patient.patient_code.ilike(term)
            | Patient.mobile_number.ilike(term)
        )

    count_result = await db.execute(sa.select(sa.func.count()).select_from(base_query.subquery()))
    total: int = count_result.scalar_one()

    rows = await db.execute(
        base_query.order_by(Patient.archived_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    patients: list[Patient] = list(rows.scalars().all())

    return patients, total


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
        sa.select(sa.func.max(Visit.visit_date)).where(Visit.patient_id == patient_id)
    )
    last_visit_date: datetime | None = latest_visit_result.scalar_one_or_none()

    # Health card status
    card_result = await db.execute(
        sa.select(HealthCard.status).where(HealthCard.patient_id == patient_id)
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
