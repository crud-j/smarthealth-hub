"""
Health card generation service — orchestrates the full card pipeline:

  generate_card   — Create a new active card (idempotent: returns existing card
                    if one is already active for the patient).
  reissue_card    — Mark the current active card as 'reissued', bump card_version,
                    generate a new card_number, and produce a fresh QR HMAC
                    (the old HMAC becomes invalid automatically because card_version
                    has changed).

Security invariant: PHI is used only for PDF rendering (server-side only).
The QR payload and NFC payload contain ONLY patient_id + card_version + HMAC.

Card number format: "BHC-{YEAR}-{6-digit-zero-padded-seq}"
  e.g. BHC-2026-000001  (same MAX() sequential pattern as patient_code)

Audit log actions written here:
  CARD_ISSUE  — on generate_card (new card or returning existing idempotent)
  CARD_ISSUE  — on reissue_card  (action="UPDATE" on old card + "CARD_ISSUE" on new)

SDP Reference: Section 6.6 (Health Cards)
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.models.health_card import HealthCard
from app.services import qr_service
from app.services import nfc_payload_service
from app.services.audit_service import write_audit_log
from app.services.patient_service import get_patient

logger = get_logger(__name__)

# Pattern used to parse the sequence number out of an existing card_number.
_CARD_NUMBER_RE = re.compile(r"^BHC-(\d{4})-(\d{6})$")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _next_card_number(db: AsyncSession) -> str:
    """
    Generate the next card_number for the current calendar year.

    Uses MAX() on existing card_numbers — same pattern as patient_code
    generation in patient_service.py.  Safe for single-BHC deployment.

    Pattern: BHC-{YEAR}-{6-digit-seq}
    """
    year = date.today().year
    prefix = f"BHC-{year}-"

    result = await db.execute(
        select(func.max(HealthCard.card_number)).where(
            HealthCard.card_number.like(f"{prefix}%")
        )
    )
    max_number: str | None = result.scalar_one_or_none()

    if max_number:
        match = _CARD_NUMBER_RE.match(max_number)
        seq = int(match.group(2)) + 1 if match else 1
    else:
        seq = 1

    return f"{prefix}{seq:06d}"


def _card_to_response_dict(card: HealthCard) -> dict:
    """Serialize a HealthCard ORM object to a plain dict for response building."""
    return {
        "id": str(card.id),
        "patient_id": str(card.patient_id),
        "card_number": card.card_number,
        "card_version": card.card_version,
        "status": card.status,
        "issued_at": card.issued_at,
        "expires_at": card.expires_at,
        "nfc_uid": card.nfc_uid,
    }


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def generate_card(
    db: AsyncSession,
    patient_id: uuid.UUID,
    issued_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> dict:
    """
    Generate a new health card for a patient (idempotent).

    If an active card already exists for the patient this function returns it
    unchanged rather than creating a duplicate.  The caller can tell the
    difference via the audit log or by checking the issued_at timestamp.

    Steps:
    1. Fetch patient — raise NotFoundError if not found or inactive.
    2. Check for an existing active card.  If found, return it (idempotent).
    3. Generate card_number with sequential BHC-{YEAR}-{seq} format.
    4. Set card_version = 1.
    5. Call qr_service.encode_qr_payload() to get (signed_url, qr_data_uri).
    6. Hash the signed_url for storage in qr_payload_hash.
    7. Insert the HealthCard row and flush to get the PK.
    8. Write CARD_ISSUE audit log entry.
    9. Return dict containing card ORM obj, qr_data_uri, and nfc_payload.

    Args:
        db:            Active async DB session.
        patient_id:    UUID of the patient to issue a card for.
        issued_by_id:  UUID of the BHW/staff performing the issuance.
        ip_address:    Client IP for audit log.

    Returns:
        {
            "card":       HealthCardResponse-compatible dict,
            "qr_data_uri": str (base64 PNG data URI),
            "nfc_payload": dict {"patient_id": str, "card_version": int}
        }

    Raises:
        NotFoundError: Patient not found or inactive.
    """
    patient = await get_patient(db, patient_id)
    if not patient.is_active:
        raise NotFoundError(f"Patient {patient_id} is inactive and cannot receive a new card.")

    # Idempotency: return the existing active card without creating a duplicate.
    existing_result = await db.execute(
        select(HealthCard).where(
            HealthCard.patient_id == patient_id,
            HealthCard.status == "active",
        )
    )
    existing_card: HealthCard | None = existing_result.scalar_one_or_none()

    if existing_card is not None:
        logger.info(
            "Health card already active — returning existing card (idempotent)",
            extra={"patient_id": str(patient_id), "card_number": existing_card.card_number},
        )
        # Regenerate QR image from stored patient_id + card_version (deterministic).
        _signed_url, qr_data_uri = qr_service.encode_qr_payload(
            str(patient_id), existing_card.card_version
        )
        return {
            "card": _card_to_response_dict(existing_card),
            "qr_data_uri": qr_data_uri,
            "nfc_payload": nfc_payload_service.build_nfc_payload(
                str(patient_id), existing_card.card_version
            ),
        }

    # Generate a new card.
    card_number = await _next_card_number(db)
    card_version = 1

    signed_url, qr_data_uri = qr_service.encode_qr_payload(
        str(patient_id), card_version
    )
    qr_hash = qr_service.hash_qr_url(signed_url)

    new_card = HealthCard(
        patient_id=patient_id,
        card_number=card_number,
        qr_payload_hash=qr_hash,
        card_version=card_version,
        status="active",
        issued_at=datetime.utcnow(),
        issued_by=issued_by_id,
    )
    db.add(new_card)
    await db.flush()  # get new_card.id before audit log

    await write_audit_log(
        db=db,
        user_id=issued_by_id,
        action="CARD_ISSUE",
        entity_type="health_card",
        entity_id=new_card.id,
        metadata={
            "patient_id": str(patient_id),
            "card_number": card_number,
            "card_version": card_version,
        },
        ip_address=ip_address,
    )

    await db.commit()
    await db.refresh(new_card)

    logger.info(
        "Health card generated",
        extra={
            "patient_id": str(patient_id),
            "card_number": card_number,
            "issued_by": str(issued_by_id),
        },
    )

    return {
        "card": _card_to_response_dict(new_card),
        "qr_data_uri": qr_data_uri,
        "nfc_payload": nfc_payload_service.build_nfc_payload(
            str(patient_id), card_version
        ),
    }


async def reissue_card(
    db: AsyncSession,
    patient_id: uuid.UUID,
    issued_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> dict:
    """
    Reissue a lost or damaged health card.

    Marks the existing active card as 'reissued', bumps card_version, generates
    a new card_number, and produces a new HMAC signature.  The old card's HMAC
    becomes invalid automatically because card_version has changed.

    Steps:
    1. Fetch the active HealthCard row for the patient.
    2. Set old card.status = 'reissued'.
    3. Determine new card_version = old_version + 1.
    4. Generate a new card_number.
    5. Compute new QR payload (new card_version → new HMAC → old sig invalid).
    6. Insert new HealthCard row and flush.
    7. Write audit log (CARD_ISSUE on new card, UPDATE on old card).
    8. Return same dict shape as generate_card.

    Args:
        db:            Active async DB session.
        patient_id:    UUID of the patient.
        issued_by_id:  UUID of the BHW/staff performing the reissue.
        ip_address:    Client IP for audit log.

    Returns:
        Same shape as generate_card():
        {"card": ..., "qr_data_uri": ..., "nfc_payload": ...}

    Raises:
        NotFoundError: No active card found for the patient.
    """
    # Fetch the existing active card.
    result = await db.execute(
        select(HealthCard).where(
            HealthCard.patient_id == patient_id,
            HealthCard.status == "active",
        )
    )
    old_card: HealthCard | None = result.scalar_one_or_none()

    if old_card is None:
        raise NotFoundError(
            f"No active health card found for patient {patient_id}. "
            "Use the generate endpoint to issue a first card."
        )

    old_card_id = old_card.id
    old_card_number = old_card.card_number
    old_version = old_card.card_version

    # Retire the old card.
    old_card.status = "reissued"

    # Generate new card attributes.
    new_card_number = await _next_card_number(db)
    new_card_version = old_version + 1

    signed_url, qr_data_uri = qr_service.encode_qr_payload(
        str(patient_id), new_card_version
    )
    qr_hash = qr_service.hash_qr_url(signed_url)

    new_card = HealthCard(
        patient_id=patient_id,
        card_number=new_card_number,
        qr_payload_hash=qr_hash,
        card_version=new_card_version,
        status="active",
        issued_at=datetime.utcnow(),
        issued_by=issued_by_id,
        # nfc_uid is None — staff must re-link via /nfc-link after reissue.
    )
    db.add(new_card)
    await db.flush()

    # Audit: UPDATE on old card (status changed to 'reissued').
    await write_audit_log(
        db=db,
        user_id=issued_by_id,
        action="UPDATE",
        entity_type="health_card",
        entity_id=old_card_id,
        metadata={
            "previous_status": "active",
            "new_status": "reissued",
            "card_number": old_card_number,
            "reason": "reissue",
        },
        ip_address=ip_address,
    )

    # Audit: CARD_ISSUE on new card.
    await write_audit_log(
        db=db,
        user_id=issued_by_id,
        action="CARD_ISSUE",
        entity_type="health_card",
        entity_id=new_card.id,
        metadata={
            "patient_id": str(patient_id),
            "card_number": new_card_number,
            "card_version": new_card_version,
            "replaces_card_number": old_card_number,
        },
        ip_address=ip_address,
    )

    await db.commit()
    await db.refresh(new_card)

    logger.info(
        "Health card reissued",
        extra={
            "patient_id": str(patient_id),
            "old_card_number": old_card_number,
            "new_card_number": new_card_number,
            "new_version": new_card_version,
        },
    )

    return {
        "card": _card_to_response_dict(new_card),
        "qr_data_uri": qr_data_uri,
        "nfc_payload": nfc_payload_service.build_nfc_payload(
            str(patient_id), new_card_version
        ),
    }
