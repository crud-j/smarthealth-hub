"""
Visit domain service — business logic for patient visit/consultation records.

Responsibilities
----------------
- list_visits    Return visit summaries for a patient (no PHI — VisitSummary)
- create_visit   Log a new visit: auto-generate case_no, AES-encrypt PHI fields,
                 write CREATE audit log
- get_visit      Fetch a single visit with decrypted PHI; write VIEW_PHI audit log

PHI encryption
--------------
``diagnosis`` and ``treatment_notes`` are AES-256-GCM encrypted at the service
layer before INSERT and decrypted after SELECT.  Other visit fields (including
``chief_complaint``, ``past_medical_history``, ``present_medical_history``) are
stored as plaintext — they are clinically useful for triage but less sensitive
than a finalized diagnosis or treatment plan.

Case number format: BHC-VISIT-{YEAR}-{6-digit-zero-padded-seq}
  e.g. BHC-VISIT-2026-000001

Sequence is computed from MAX(case_no) on the visits table for the current year.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.models.visit import Visit
from app.schemas.visit import VisitCreate, VisitResponse, VisitSummary
from app.services.audit_service import write_audit_log
from app.utils.encryption import decrypt_text, encrypt_text

logger = get_logger(__name__)

_CASE_NO_RE = re.compile(r"^BHC-VISIT-(\d{4})-(\d{6})$")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _next_case_no(db: AsyncSession) -> str:
    """
    Generate the next case_no by querying the current maximum sequence
    number for the current calendar year.

    Pattern: BHC-VISIT-{YEAR}-{6-digit-seq}
    """
    year = date.today().year
    prefix = f"BHC-VISIT-{year}-"

    result = await db.execute(
        select(func.max(Visit.case_no)).where(
            Visit.case_no.like(f"{prefix}%")
        )
    )
    max_code: str | None = result.scalar_one_or_none()

    if max_code:
        match = _CASE_NO_RE.match(max_code)
        seq = int(match.group(2)) + 1 if match else 1
    else:
        seq = 1

    return f"{prefix}{seq:06d}"


def _build_visit_response(visit: Visit, patient_name: str | None = None) -> VisitResponse:
    """
    Build a VisitResponse with decrypted PHI fields.

    Decryption is idempotent — if the value was stored as plaintext (e.g.
    before encryption was enabled) ``decrypt_text`` returns it unchanged.
    """
    return VisitResponse(
        id=str(visit.id),
        patient_id=str(visit.patient_id),
        recorded_by=str(visit.recorded_by) if visit.recorded_by else None,
        case_no=visit.case_no,
        visit_date=visit.visit_date,
        visit_type=visit.visit_type,
        created_at=visit.created_at,
        # Vital signs (all nullable)
        blood_pressure=visit.blood_pressure,
        temperature=float(visit.temperature) if visit.temperature is not None else None,
        pulse_rate=visit.pulse_rate,
        respiratory_rate=visit.respiratory_rate,
        oxygen_saturation=visit.oxygen_saturation,
        weight_kg=float(visit.weight_kg) if visit.weight_kg is not None else None,
        height_cm=float(visit.height_cm) if visit.height_cm is not None else None,
        # Plaintext history fields
        chief_complaint=visit.chief_complaint,
        past_medical_history=visit.past_medical_history,
        present_medical_history=visit.present_medical_history,
        # Decrypted PHI
        diagnosis=decrypt_text(visit.diagnosis) if visit.diagnosis else None,
        treatment_notes=decrypt_text(visit.treatment_notes) if visit.treatment_notes else None,
        patient_name=patient_name,
    )


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def list_visits(
    db: AsyncSession,
    patient_id: uuid.UUID,
) -> list[VisitSummary]:
    """
    Return a chronological list of visit summaries for a patient.

    PHI fields (diagnosis, treatment_notes) are NOT included in the list.
    Use ``get_visit`` for the full decrypted record.

    Raises:
        NotFoundError: If no patient with the given ID exists (verified via
                       the patients table in the patient endpoint layer, but
                       this service trusts the caller has already validated).
    """
    result = await db.execute(
        select(Visit)
        .where(Visit.patient_id == patient_id)
        .order_by(Visit.visit_date.desc())
    )
    visits: list[Visit] = list(result.scalars().all())

    return [
        VisitSummary(
            id=str(v.id),
            patient_id=str(v.patient_id),
            case_no=v.case_no,
            visit_date=v.visit_date,
            visit_type=v.visit_type,
            chief_complaint=v.chief_complaint,
            blood_pressure=v.blood_pressure,
            temperature=float(v.temperature) if v.temperature is not None else None,
            pulse_rate=v.pulse_rate,
            created_at=v.created_at,
        )
        for v in visits
    ]


async def create_visit(
    db: AsyncSession,
    patient_id: uuid.UUID,
    data: VisitCreate,
    recorded_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> VisitResponse:
    """
    Log a new patient visit.

    Steps:
    1. Auto-generate ``case_no`` if not supplied.
    2. AES-256-GCM encrypt ``diagnosis`` and ``treatment_notes``.
    3. Persist the Visit row.
    4. Write a CREATE audit log entry.
    5. Return VisitResponse (with decrypted PHI for the immediate response).

    Args:
        db:             Active async database session.
        patient_id:     UUID of the patient being visited.
        data:           Validated VisitCreate payload.
        recorded_by_id: UUID of the staff member recording the visit (from JWT).
        ip_address:     Client IP for audit log.
    """
    case_no = data.case_no or await _next_case_no(db)

    vs = data.vital_signs
    visit_date = data.visit_date or datetime.utcnow()

    # Encrypt PHI fields before storage
    encrypted_diagnosis: str | None = (
        encrypt_text(data.diagnosis) if data.diagnosis else None
    )
    encrypted_treatment: str | None = (
        encrypt_text(data.treatment_notes) if data.treatment_notes else None
    )

    visit = Visit(
        patient_id=patient_id,
        recorded_by=recorded_by_id,
        case_no=case_no,
        visit_date=visit_date,
        visit_type=data.visit_type,
        # Vital signs
        blood_pressure=vs.blood_pressure,
        temperature=vs.temperature,
        pulse_rate=vs.pulse_rate,
        respiratory_rate=vs.respiratory_rate,
        oxygen_saturation=vs.oxygen_saturation,
        weight_kg=vs.weight_kg,
        height_cm=vs.height_cm,
        # History (plaintext)
        chief_complaint=data.chief_complaint,
        past_medical_history=data.past_medical_history,
        present_medical_history=data.present_medical_history,
        # Encrypted PHI
        diagnosis=encrypted_diagnosis,
        treatment_notes=encrypted_treatment,
    )

    db.add(visit)
    await db.flush()  # assigns visit.id

    await write_audit_log(
        db=db,
        user_id=recorded_by_id,
        action="CREATE",
        entity_type="visit",
        entity_id=visit.id,
        metadata={
            "patient_id": str(patient_id),
            "case_no": case_no,
            "visit_type": data.visit_type,
        },
        ip_address=ip_address,
    )

    await db.commit()
    await db.refresh(visit)

    logger.info(
        "Visit logged",
        extra={
            "visit_id": str(visit.id),
            "case_no": case_no,
            "patient_id": str(patient_id),
            "recorded_by": str(recorded_by_id),
        },
    )

    return _build_visit_response(visit)


async def get_visit(
    db: AsyncSession,
    visit_id: uuid.UUID,
    accessed_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> VisitResponse:
    """
    Fetch a single visit with decrypted PHI fields.

    Writes a VIEW_PHI audit log entry on every access.  Caller is responsible
    for enforcing clinical-role access before calling this function.

    Raises:
        NotFoundError: If no visit with the given ID exists.
    """
    from app.models.patient import Patient  # avoid circular import at module level

    result = await db.execute(
        select(Visit).where(Visit.id == visit_id)
    )
    visit: Visit | None = result.scalar_one_or_none()
    if visit is None:
        raise NotFoundError(f"Visit with ID {visit_id} was not found.")

    # Fetch patient name for convenience field
    patient_result = await db.execute(
        select(Patient.first_name, Patient.last_name).where(
            Patient.id == visit.patient_id
        )
    )
    patient_row = patient_result.one_or_none()
    patient_name: str | None = None
    if patient_row:
        patient_name = f"{patient_row.first_name} {patient_row.last_name}"

    await write_audit_log(
        db=db,
        user_id=accessed_by_id,
        action="VIEW_PHI",
        entity_type="visit",
        entity_id=visit_id,
        metadata={"patient_id": str(visit.patient_id), "case_no": visit.case_no},
        ip_address=ip_address,
    )

    await db.commit()

    return _build_visit_response(visit, patient_name=patient_name)
