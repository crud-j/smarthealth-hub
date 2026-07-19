"""
Medical history domain service — business logic for patient medical history records.

Responsibilities
----------------
- list_medical_history   Return all condition entries for a patient without
                         decrypting notes (safe for all authenticated roles).
- add_medical_history    Insert a new entry: encrypt notes with AES-256-GCM,
                         write CREATE audit log, return MedicalHistoryResponse
                         with decrypted notes (caller already has write access
                         and is implicitly Physician/Admin).
- get_medical_history_entry
                         Fetch a single entry and decrypt notes; write VIEW_PHI
                         audit log.  The endpoint layer decides whether to
                         include notes based on caller role and passes a flag.

PHI encryption
--------------
``notes`` is AES-256-GCM encrypted at the service layer before INSERT and
decrypted after SELECT for authorized callers only.  All other fields are
stored as plaintext.

Audit log actions used
----------------------
  CREATE   — new medical history entry added
  VIEW_PHI — single entry with decrypted notes accessed

SDP Reference: Section 6.3
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.models.medical_history import MedicalHistory
from app.schemas.medical_history import (
    MedicalHistoryCreate,
    MedicalHistoryListItem,
    MedicalHistoryListResponse,
    MedicalHistoryResponse,
)
from app.services.audit_service import write_audit_log
from app.utils.encryption import decrypt_text, encrypt_text

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Internal builder helpers
# ---------------------------------------------------------------------------


def _build_list_item(entry: MedicalHistory) -> MedicalHistoryListItem:
    """
    Build a MedicalHistoryListItem from an ORM instance.

    ``notes`` is never included in the list view (PHI minimisation).
    ``redacted`` is True when the encrypted notes column is non-null, so the
    frontend can offer a "view notes" control to clinical roles.
    """
    return MedicalHistoryListItem(
        id=str(entry.id),
        patient_id=str(entry.patient_id),
        condition_name=entry.condition_name,
        severity=entry.severity,
        diagnosed_date=entry.diagnosed_date,
        recorded_by=str(entry.recorded_by) if entry.recorded_by else None,
        created_at=entry.created_at,
        redacted=entry.notes is not None,
    )


def _build_response(
    entry: MedicalHistory,
    *,
    include_notes: bool,
) -> MedicalHistoryResponse:
    """
    Build a MedicalHistoryResponse from an ORM instance.

    Args:
        entry:         The ORM MedicalHistory row.
        include_notes: When True the notes column is decrypted and returned.
                       When False notes are set to None and ``redacted`` is
                       True if notes exist, signalling PHI was withheld.
    """
    if include_notes and entry.notes is not None:
        decrypted_notes: str | None = decrypt_text(entry.notes)
        redacted = False
    else:
        decrypted_notes = None
        # Mark as redacted only when notes exist but were withheld
        redacted = (not include_notes) and (entry.notes is not None)

    return MedicalHistoryResponse(
        id=str(entry.id),
        patient_id=str(entry.patient_id),
        condition_name=entry.condition_name,
        severity=entry.severity,
        diagnosed_date=entry.diagnosed_date,
        recorded_by=str(entry.recorded_by) if entry.recorded_by else None,
        created_at=entry.created_at,
        notes=decrypted_notes,
        redacted=redacted,
    )


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def list_medical_history(
    db: AsyncSession,
    patient_id: uuid.UUID,
) -> MedicalHistoryListResponse:
    """
    Return all medical history entries for a patient, ordered newest first.

    Notes are never decrypted in the list view — the ``redacted`` flag on
    each item indicates when notes exist but have been withheld.

    Args:
        db:         Active async database session.
        patient_id: UUID of the patient whose history is being listed.

    Returns:
        MedicalHistoryListResponse containing the list items, total count,
        and a top-level ``redacted`` flag if any item has notes.
    """
    result = await db.execute(
        select(MedicalHistory)
        .where(MedicalHistory.patient_id == patient_id)
        .order_by(MedicalHistory.created_at.desc())
    )
    entries: list[MedicalHistory] = list(result.scalars().all())

    items = [_build_list_item(e) for e in entries]
    any_redacted = any(item.redacted for item in items)

    logger.debug(
        "Listed medical history",
        extra={"patient_id": str(patient_id), "count": len(items)},
    )

    return MedicalHistoryListResponse(
        patient_id=str(patient_id),
        items=items,
        total=len(items),
        redacted=any_redacted,
    )


async def add_medical_history(
    db: AsyncSession,
    patient_id: uuid.UUID,
    data: MedicalHistoryCreate,
    recorded_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> MedicalHistoryResponse:
    """
    Insert a new medical history entry for a patient.

    Steps:
    1. AES-256-GCM encrypt ``notes`` (if provided).
    2. Persist the MedicalHistory row.
    3. Write a CREATE audit log entry.
    4. Commit and refresh.
    5. Return MedicalHistoryResponse with decrypted notes (the caller already
       holds Physician/Admin role to reach this function).

    Args:
        db:             Active async database session.
        patient_id:     UUID of the patient record.
        data:           Validated MedicalHistoryCreate payload.
        recorded_by_id: UUID of the clinical staff creating the entry (from JWT).
        ip_address:     Client IP for the audit log entry.

    Returns:
        MedicalHistoryResponse with the new entry's data and decrypted notes.
    """
    # Encrypt notes before storage — None is preserved as None
    encrypted_notes: str | None = (
        encrypt_text(data.notes) if data.notes else None
    )

    entry = MedicalHistory(
        patient_id=patient_id,
        condition_name=data.condition_name,
        notes=encrypted_notes,
        severity=data.severity.value if data.severity else None,
        diagnosed_date=data.diagnosed_date,
        recorded_by=recorded_by_id,
    )

    db.add(entry)
    await db.flush()  # assigns entry.id before audit log

    await write_audit_log(
        db=db,
        user_id=recorded_by_id,
        action="CREATE",
        entity_type="medical_history",
        entity_id=entry.id,
        metadata={
            "patient_id": str(patient_id),
            "condition_name": data.condition_name,
            "severity": data.severity.value if data.severity else None,
            "has_notes": encrypted_notes is not None,
        },
        ip_address=ip_address,
    )

    await db.commit()
    await db.refresh(entry)

    logger.info(
        "Medical history entry created",
        extra={
            "entry_id": str(entry.id),
            "patient_id": str(patient_id),
            "condition_name": data.condition_name,
            "recorded_by": str(recorded_by_id),
        },
    )

    # Return with notes decrypted — the caller has Physician/Admin role
    return _build_response(entry, include_notes=True)


async def get_medical_history_entry(
    db: AsyncSession,
    entry_id: uuid.UUID,
    accessed_by_id: uuid.UUID,
    include_notes: bool,
    ip_address: str | None = None,
) -> MedicalHistoryResponse:
    """
    Fetch a single medical history entry by its ID.

    When ``include_notes`` is True (Physician/Admin caller) the notes column is
    decrypted and included in the response.  When False (BHW/admin_staff) notes
    are withheld and ``redacted`` is set to True if notes exist.

    A VIEW_PHI audit log is written regardless of whether notes are actually
    decrypted — accessing an individual record's metadata is itself a PHI-
    adjacent action that should be traceable.

    Args:
        db:              Active async database session.
        entry_id:        UUID of the medical history entry.
        accessed_by_id:  UUID of the requesting user (from JWT).
        include_notes:   Whether to decrypt and return the notes field.
        ip_address:      Client IP for the audit log.

    Returns:
        MedicalHistoryResponse (notes populated or None per ``include_notes``).

    Raises:
        NotFoundError: If no entry with the given ID exists.
    """
    result = await db.execute(
        select(MedicalHistory).where(MedicalHistory.id == entry_id)
    )
    entry: MedicalHistory | None = result.scalar_one_or_none()

    if entry is None:
        raise NotFoundError(
            f"Medical history entry with ID {entry_id} was not found."
        )

    await write_audit_log(
        db=db,
        user_id=accessed_by_id,
        action="VIEW_PHI",
        entity_type="medical_history",
        entity_id=entry_id,
        metadata={
            "patient_id": str(entry.patient_id),
            "condition_name": entry.condition_name,
            "notes_decrypted": include_notes and entry.notes is not None,
        },
        ip_address=ip_address,
    )

    await db.commit()

    logger.debug(
        "Medical history entry accessed",
        extra={
            "entry_id": str(entry_id),
            "accessed_by": str(accessed_by_id),
            "notes_decrypted": include_notes,
        },
    )

    return _build_response(entry, include_notes=include_notes)
