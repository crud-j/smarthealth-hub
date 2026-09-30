"""
Immunization domain service — all business logic for immunization records.

Responsibilities
----------------
- list_immunizations   Paginated list for a given patient
- get_immunization     Fetch by ID + patient_id; raises NotFoundError on miss
- create_immunization  Insert new record; write CREATE audit log
- update_immunization  Partial update; write UPDATE audit log
- delete_immunization  Hard delete; write DELETE audit log
- list_due             List immunizations with next_due_date within a window

All audit logs are written within the same database transaction as the
primary operation.  If the audit write fails it is swallowed (audit_service
never raises) — this must never block a clinical workflow.

SDP Reference: Section 6.4
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.models.immunization import Immunization
from app.schemas.immunization import ImmunizationCreate, ImmunizationUpdate
from app.services.audit_service import write_audit_log

logger = get_logger(__name__)


def _build_response_dict(rec: Immunization) -> dict[str, Any]:
    """Serialize an Immunization ORM instance to a plain dict for schema construction."""
    return {
        "id": str(rec.id),
        "patient_id": str(rec.patient_id),
        "vaccine_name": rec.vaccine_name,
        "dose_number": rec.dose_number,
        "date_administered": rec.date_administered,
        "administered_by": str(rec.administered_by) if rec.administered_by else None,
        "batch_number": rec.batch_number,
        "next_due_date": rec.next_due_date,
        "notes": rec.notes,
        "status": rec.status,
        "created_at": rec.created_at,
        "updated_at": rec.updated_at,
    }


async def list_immunizations(
    db: AsyncSession,
    patient_id: uuid.UUID,
    *,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Immunization], int]:
    """
    Return a paginated list of immunization records for ``patient_id``,
    ordered oldest-first by ``date_administered`` then ``created_at``.

    Returns:
        Tuple of (list of Immunization ORM objects, total_count).
    """
    base_query = select(Immunization).where(Immunization.patient_id == patient_id)

    # Total count
    count_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total: int = count_result.scalar_one()

    offset = (page - 1) * page_size
    rows = await db.execute(
        base_query.order_by(
            Immunization.date_administered.asc().nullslast(), Immunization.created_at.asc()
        )
        .offset(offset)
        .limit(page_size)
    )
    records: list[Immunization] = list(rows.scalars().all())
    return records, total


async def get_immunization(
    db: AsyncSession,
    immunization_id: uuid.UUID,
    patient_id: uuid.UUID,
) -> Immunization:
    """
    Fetch a single immunization record that belongs to ``patient_id``.

    Raises:
        NotFoundError: If no matching record exists.
    """
    result = await db.execute(
        select(Immunization).where(
            Immunization.id == immunization_id,
            Immunization.patient_id == patient_id,
        )
    )
    record: Immunization | None = result.scalar_one_or_none()
    if record is None:
        raise NotFoundError(f"Immunization {immunization_id} not found for patient {patient_id}.")
    return record


async def create_immunization(
    db: AsyncSession,
    patient_id: uuid.UUID,
    data: ImmunizationCreate,
    created_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> Immunization:
    """
    Insert a new immunization record for ``patient_id`` and write a CREATE
    audit log entry.

    Returns:
        The newly created Immunization ORM instance.
    """
    record = Immunization(
        patient_id=patient_id,
        vaccine_name=data.vaccine_name,
        dose_number=data.dose_number,
        date_administered=data.date_administered,
        administered_by=data.administered_by,
        batch_number=data.batch_number,
        next_due_date=data.next_due_date,
        notes=data.notes,
        status=data.status,
    )
    db.add(record)
    await db.flush()  # assign record.id before audit log

    await write_audit_log(
        db=db,
        user_id=created_by_id,
        action="CREATE",
        entity_type="immunization",
        entity_id=record.id,
        metadata={
            "patient_id": str(patient_id),
            "vaccine_name": data.vaccine_name,
            "dose_number": data.dose_number,
        },
        ip_address=ip_address,
    )

    await db.commit()
    await db.refresh(record)

    logger.info(
        "Immunization created",
        extra={
            "immunization_id": str(record.id),
            "patient_id": str(patient_id),
            "vaccine": data.vaccine_name,
            "created_by": str(created_by_id),
        },
    )
    return record


async def update_immunization(
    db: AsyncSession,
    immunization_id: uuid.UUID,
    patient_id: uuid.UUID,
    data: ImmunizationUpdate,
    updated_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> Immunization:
    """
    Partial-update an immunization record.

    Only fields explicitly provided (non-None) in ``data`` are changed.
    Writes an UPDATE audit log entry.

    Raises:
        NotFoundError: If the record does not exist for this patient.
    """
    record = await get_immunization(db, immunization_id, patient_id)

    changed_fields: list[str] = []
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(record, field, value)
        changed_fields.append(field)

    record.updated_at = datetime.utcnow()  # type: ignore[assignment]

    await write_audit_log(
        db=db,
        user_id=updated_by_id,
        action="UPDATE",
        entity_type="immunization",
        entity_id=immunization_id,
        metadata={
            "patient_id": str(patient_id),
            "changed_fields": changed_fields,
        },
        ip_address=ip_address,
    )

    await db.commit()
    await db.refresh(record)
    return record


async def delete_immunization(
    db: AsyncSession,
    immunization_id: uuid.UUID,
    patient_id: uuid.UUID,
    deleted_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> None:
    """
    Hard-delete an immunization record and write a DELETE audit log entry.

    Raises:
        NotFoundError: If the record does not exist for this patient.
    """
    record = await get_immunization(db, immunization_id, patient_id)

    await write_audit_log(
        db=db,
        user_id=deleted_by_id,
        action="DELETE",
        entity_type="immunization",
        entity_id=immunization_id,
        metadata={
            "patient_id": str(patient_id),
            "vaccine_name": record.vaccine_name,
            "dose_number": record.dose_number,
        },
        ip_address=ip_address,
    )

    await db.delete(record)
    await db.commit()

    logger.info(
        "Immunization deleted",
        extra={
            "immunization_id": str(immunization_id),
            "patient_id": str(patient_id),
            "deleted_by": str(deleted_by_id),
        },
    )


async def list_due(
    db: AsyncSession,
    *,
    days_ahead: int = 7,
) -> list[Immunization]:
    """
    Return scheduled immunizations whose ``next_due_date`` falls on or before
    ``today + days_ahead`` (includes overdue records where next_due_date < today).

    Used by the immunization tracking board and the SMS reminder scheduler.
    """
    cutoff = date.today() + timedelta(days=days_ahead)
    result = await db.execute(
        select(Immunization)
        .where(
            Immunization.status == "scheduled",
            Immunization.next_due_date.isnot(None),
            Immunization.next_due_date <= cutoff,
        )
        .order_by(Immunization.next_due_date.asc())
    )
    return list(result.scalars().all())


async def get_due_summary(db: AsyncSession) -> dict[str, int]:
    """
    Return counts of scheduled immunizations due within the next 7 and 30 days
    (includes overdue records where next_due_date < today).

    Used by the immunization tracking board stats bar.
    """
    today = date.today()
    week_cutoff = today + timedelta(days=7)
    month_cutoff = today + timedelta(days=30)

    base_filter = (
        Immunization.status == "scheduled",
        Immunization.next_due_date.isnot(None),
        Immunization.next_due_date <= month_cutoff,
    )

    month_result = await db.execute(
        select(func.count()).select_from(Immunization).where(*base_filter)
    )
    due_this_month: int = month_result.scalar_one()

    week_result = await db.execute(
        select(func.count())
        .select_from(Immunization)
        .where(
            Immunization.status == "scheduled",
            Immunization.next_due_date.isnot(None),
            Immunization.next_due_date <= week_cutoff,
        )
    )
    due_this_week: int = week_result.scalar_one()

    return {"due_this_week": due_this_week, "due_this_month": due_this_month}


async def list_all_immunizations(
    db: AsyncSession,
    *,
    vaccine_name: str | None = None,
    due_filter: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[tuple[Immunization, str]], int]:
    """
    Cross-patient paginated immunization list with patient full_name joined.

    Args:
        db:           Async DB session.
        vaccine_name: Optional exact vaccine name filter.
        due_filter:   One of "due_this_week", "due_this_month", "overdue" or None.
        page:         1-based page number.
        page_size:    Records per page.

    Returns:
        Tuple of (list of (Immunization, patient_full_name) tuples, total_count).
    """
    from app.models.patient import Patient  # noqa: PLC0415 — avoid circular at module level

    today = date.today()

    base_query = select(
        Immunization,
        func.concat(Patient.first_name, sa.literal(" "), Patient.last_name).label(
            "patient_full_name"
        ),
    ).join(Patient, Immunization.patient_id == Patient.id)

    filters = []
    if vaccine_name:
        filters.append(Immunization.vaccine_name == vaccine_name)

    if due_filter == "due_this_week":
        filters.extend(
            [
                Immunization.status == "scheduled",
                Immunization.next_due_date.isnot(None),
                Immunization.next_due_date <= today + timedelta(days=7),
            ]
        )
    elif due_filter == "due_this_month":
        filters.extend(
            [
                Immunization.status == "scheduled",
                Immunization.next_due_date.isnot(None),
                Immunization.next_due_date <= today + timedelta(days=30),
            ]
        )
    elif due_filter == "overdue":
        filters.extend(
            [
                Immunization.status == "scheduled",
                Immunization.next_due_date.isnot(None),
                Immunization.next_due_date < today,
            ]
        )

    if filters:
        base_query = base_query.where(*filters)

    count_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total: int = count_result.scalar_one()

    offset = (page - 1) * page_size
    rows_result = await db.execute(
        base_query.order_by(
            Immunization.next_due_date.asc().nullslast(), Immunization.created_at.desc()
        )
        .offset(offset)
        .limit(page_size)
    )
    rows = rows_result.all()
    return [(row[0], row[1]) for row in rows], total


async def count_distinct_vaccines(db: AsyncSession) -> int:
    """Return the count of distinct vaccine_name values across all immunization records."""
    result = await db.execute(select(func.count(func.distinct(Immunization.vaccine_name))))
    return result.scalar_one()


async def count_total_immunizations(db: AsyncSession) -> int:
    """Return the total count of all immunization records."""
    result = await db.execute(select(func.count()).select_from(Immunization))
    return result.scalar_one()
