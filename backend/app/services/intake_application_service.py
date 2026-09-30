"""
Intake application service — public self-registration and admin review.

Public flow:
  1. Patient visits /register, fills form, submits.
  2. POST /intake-applications saves to intake_applications with status='pending'.
  3. Applicant sees confirmation page with reference_number.

Admin review flow:
  1. Admin visits /settings/intake-applications in the dashboard.
  2. GET /intake-applications lists pending (and all) applications.
  3. Admin opens detail, clicks Approve → POST /intake-applications/{id}/approve
       - Validates form_data via PatientCreate schema.
       - Calls patient_service.create_patient() to create the Patient record.
       - Sets application.status='approved', application.patient_id.
       - Writes audit log (INTAKE_APPLICATION_APPROVED).
  4. Or clicks Reject → POST /intake-applications/{id}/reject
       - Sets application.status='rejected', application.rejection_reason.
       - Writes audit log (INTAKE_APPLICATION_REJECTED).
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.models.intake_application import IntakeApplication
from app.schemas.intake_application import IntakeApplicationCreate

logger = get_logger(__name__)

# Reference number format: APP-YYYYMMDD-XXXX (4 random hex chars)
_REF_RE = re.compile(r"^APP-\d{8}-[A-F0-9]{4}$")


def _generate_reference_number() -> str:
    today = datetime.now(UTC).strftime("%Y%m%d")
    suffix = uuid.uuid4().hex[:4].upper()
    return f"APP-{today}-{suffix}"


def _form_data_from_payload(payload: IntakeApplicationCreate) -> dict[str, Any]:
    """Convert validated payload to the JSONB form_data dict."""
    return payload.model_dump(mode="json")


async def create_application(
    db: AsyncSession,
    payload: IntakeApplicationCreate,
    submitted_ip: str | None = None,
) -> IntakeApplication:
    """
    Save a new public intake application with status='pending'.

    Generates a unique reference number (retries once on collision, which
    is astronomically unlikely in a single-BHC deployment).
    """
    form_data = _form_data_from_payload(payload)

    # Attempt unique reference number generation (max 3 tries)
    for _ in range(3):
        ref = _generate_reference_number()
        exists = await db.execute(
            sa.select(sa.func.count()).where(IntakeApplication.reference_number == ref)
        )
        if (exists.scalar_one() or 0) == 0:
            break

    application = IntakeApplication(
        reference_number=ref,
        status="pending",
        form_data=form_data,
        known_allergies=payload.known_allergies,
        current_medications=payload.current_medications,
        pre_existing_conditions=payload.pre_existing_conditions,
        submitted_ip=submitted_ip,
    )
    db.add(application)
    await db.commit()
    await db.refresh(application)

    logger.info(
        "Intake application submitted",
        extra={
            "reference_number": ref,
            "applicant_name": f"{payload.first_name} {payload.last_name}",
            "ip": submitted_ip,
        },
    )
    return application


async def get_application(
    db: AsyncSession,
    application_id: uuid.UUID,
) -> IntakeApplication:
    result = await db.execute(
        sa.select(IntakeApplication).where(IntakeApplication.id == application_id)
    )
    app: IntakeApplication | None = result.scalar_one_or_none()
    if app is None:
        raise NotFoundError(f"Intake application {application_id} not found.")
    return app


async def list_applications(
    db: AsyncSession,
    *,
    status: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[IntakeApplication], int]:
    """
    Return a paginated list of intake applications.

    Filters:
      status — 'pending' | 'approved' | 'rejected' | None (all)
      q      — free-text search on reference_number, first_name, last_name
    """
    base = sa.select(IntakeApplication)

    if status:
        base = base.where(IntakeApplication.status == status)

    if q:
        term = f"%{q}%"
        # Search within form_data JSONB for name fields, or reference_number
        base = base.where(
            IntakeApplication.reference_number.ilike(term)
            | sa.cast(
                IntakeApplication.form_data["first_name"].astext, sa.String
            ).ilike(term)
            | sa.cast(
                IntakeApplication.form_data["last_name"].astext, sa.String
            ).ilike(term)
        )

    count_result = await db.execute(
        sa.select(sa.func.count()).select_from(base.subquery())
    )
    total: int = count_result.scalar_one()

    items_result = await db.execute(
        base
        .order_by(IntakeApplication.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list(items_result.scalars().all())

    return items, total


async def approve_application(
    db: AsyncSession,
    application_id: uuid.UUID,
    reviewed_by_id: uuid.UUID,
    registration_source: str = "walk_in",
    ip_address: str | None = None,
) -> "Any":  # returns Patient
    """
    Approve an intake application — creates a Patient record from form_data.

    Steps:
      1. Load the application; assert status == 'pending'.
      2. Map form_data to PatientCreate schema.
      3. Call patient_service.create_patient().
      4. Mark application as approved; link patient_id.
      5. Write audit log.
      6. Commit.

    Returns the created Patient ORM object.
    """
    from app.schemas.patient import PatientCreate  # noqa: PLC0415
    from app.services import patient_service  # noqa: PLC0415
    from app.services.audit_service import write_audit_log  # noqa: PLC0415

    app = await get_application(db, application_id)

    if app.status != "pending":
        raise ValueError(
            f"Application {app.reference_number} is already {app.status}. "
            "Only pending applications can be approved."
        )

    # Map JSONB form_data to PatientCreate.
    # The public form collects a slightly different field set, so we need to
    # map it carefully before validating with the existing PatientCreate schema.
    fd: dict[str, Any] = dict(app.form_data)

    # Compose a full address from the parts collected by the intake form
    address_parts = [
        fd.get("house_street"),
        fd.get("barangay"),
        fd.get("municipality"),
        fd.get("province"),
    ]
    composed_address = ", ".join(p for p in address_parts if p)

    # sex: intake form allows 'other'; Patient model only allows 'male'/'female'.
    # If 'other', we store 'male' as a fallback (staff can update after approval)
    # and log a note.
    patient_sex = fd.get("sex", "male")
    if patient_sex not in ("male", "female"):
        patient_sex = "male"
        logger.info(
            "Intake application sex='other' normalised to 'male' for patient record",
            extra={"reference_number": app.reference_number},
        )

    patient_payload: dict[str, Any] = {
        "first_name": fd.get("first_name", ""),
        "middle_name": fd.get("middle_name"),
        "last_name": fd.get("last_name", ""),
        "birth_date": fd.get("birth_date"),
        "sex": patient_sex,
        "civil_status": fd.get("civil_status"),
        "barangay": fd.get("barangay"),
        "municipality": fd.get("municipality"),
        "province": fd.get("province"),
        "mobile_number": fd.get("mobile_number"),
        "address": composed_address or fd.get("barangay", ""),
        "emergency_contact_name": fd.get("emergency_contact_name"),
        "emergency_contact_number": fd.get("emergency_contact_number"),
        "philhealth_no": fd.get("philhealth_id"),
        "pwd_id_number": fd.get("pwd_id"),
        "blood_type": fd.get("blood_type"),
        "allergies": fd.get("known_allergies") or app.known_allergies,
        "known_conditions": fd.get("pre_existing_conditions") or app.pre_existing_conditions,
        "is_pwd": bool(fd.get("pwd_id")),
        "registration_source": registration_source,
        "registration_data_source": "pre_visit",
        "data_privacy_consent": True,
        "confirm_duplicate": False,
    }

    try:
        patient_data = PatientCreate.model_validate(patient_payload)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Application form data is invalid for patient creation: {exc}") from exc

    patient, _matches = await patient_service.create_patient(
        db=db,
        data=patient_data,
        created_by_id=reviewed_by_id,
        ip_address=ip_address,
        confirm_duplicate=True,  # Admin has already reviewed — bypass duplicate check
    )

    if patient is None:
        raise ValueError("Duplicate patient detected. Please resolve the duplicate before approving.")

    # Update application record
    app.status = "approved"
    app.reviewed_by_id = reviewed_by_id
    app.reviewed_at = datetime.now(UTC)
    app.patient_id = patient.id

    await write_audit_log(
        db=db,
        action="INTAKE_APPLICATION_APPROVED",
        entity_type="intake_application",
        user_id=reviewed_by_id,
        entity_id=application_id,
        metadata={
            "reference_number": app.reference_number,
            "patient_id": str(patient.id),
            "patient_code": patient.patient_code,
        },
        ip_address=ip_address,
    )

    await db.commit()

    logger.info(
        "Intake application approved",
        extra={
            "reference_number": app.reference_number,
            "patient_id": str(patient.id),
            "patient_code": patient.patient_code,
        },
    )
    return patient


async def reject_application(
    db: AsyncSession,
    application_id: uuid.UUID,
    reviewed_by_id: uuid.UUID,
    rejection_reason: str,
    ip_address: str | None = None,
) -> IntakeApplication:
    """
    Reject an intake application.

    Sets status='rejected', records the rejection_reason, writes audit log.
    """
    from app.services.audit_service import write_audit_log  # noqa: PLC0415

    app = await get_application(db, application_id)

    if app.status != "pending":
        raise ValueError(
            f"Application {app.reference_number} is already {app.status}. "
            "Only pending applications can be rejected."
        )

    app.status = "rejected"
    app.reviewed_by_id = reviewed_by_id
    app.reviewed_at = datetime.now(UTC)
    app.rejection_reason = rejection_reason.strip()

    await write_audit_log(
        db=db,
        action="INTAKE_APPLICATION_REJECTED",
        entity_type="intake_application",
        user_id=reviewed_by_id,
        entity_id=application_id,
        metadata={
            "reference_number": app.reference_number,
            "rejection_reason": rejection_reason,
        },
        ip_address=ip_address,
    )

    await db.commit()
    await db.refresh(app)

    logger.info(
        "Intake application rejected",
        extra={
            "reference_number": app.reference_number,
            "reason": rejection_reason,
        },
    )
    return app


def map_application_to_summary(app: IntakeApplication) -> dict[str, Any]:
    """Map an IntakeApplication ORM object to the IntakeApplicationSummary shape."""
    fd: dict[str, Any] = app.form_data or {}
    return {
        "id": str(app.id),
        "reference_number": app.reference_number,
        "status": app.status,
        "first_name": fd.get("first_name", ""),
        "last_name": fd.get("last_name", ""),
        "birth_date": fd.get("birth_date"),
        "sex": fd.get("sex", ""),
        "mobile_number": fd.get("mobile_number"),
        "barangay": fd.get("barangay", ""),
        "municipality": fd.get("municipality", ""),
        "created_at": app.created_at,
        "reviewed_at": app.reviewed_at,
        "patient_id": str(app.patient_id) if app.patient_id else None,
    }


def map_application_to_detail(app: IntakeApplication) -> dict[str, Any]:
    """Map to IntakeApplicationDetail (superset of Summary)."""
    fd: dict[str, Any] = app.form_data or {}
    base = map_application_to_summary(app)
    base.update({
        "middle_name": fd.get("middle_name"),
        "suffix": fd.get("suffix"),
        "civil_status": fd.get("civil_status"),
        "philhealth_id": fd.get("philhealth_id"),
        "pwd_id": fd.get("pwd_id"),
        "blood_type": fd.get("blood_type"),
        "email": fd.get("email"),
        "house_street": fd.get("house_street"),
        "province": fd.get("province"),
        "region": fd.get("region"),
        "zip_code": fd.get("zip_code"),
        "emergency_contact_name": fd.get("emergency_contact_name", ""),
        "emergency_contact_relationship": fd.get("emergency_contact_relationship"),
        "emergency_contact_number": fd.get("emergency_contact_number", ""),
        "known_allergies": app.known_allergies or fd.get("known_allergies"),
        "current_medications": app.current_medications or fd.get("current_medications"),
        "pre_existing_conditions": app.pre_existing_conditions or fd.get("pre_existing_conditions"),
        "data_privacy_consent": fd.get("data_privacy_consent", True),
        "rejection_reason": app.rejection_reason,
        "reviewed_by_id": str(app.reviewed_by_id) if app.reviewed_by_id else None,
        "submitted_ip": app.submitted_ip,
    })
    return base
