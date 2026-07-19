"""
NFC payload service — builds the minimal NDEF-style JSON written to physical
NFC health cards and manages the binding of NFC chip UIDs to card records.

Security invariant (strictly enforced):
  The NFC chip stores ONLY:
    - patient_id  (UUID string)
    - card_version (integer)

  No PHI (name, DOB, address, diagnosis, PhilHealth number, etc.) is ever
  written to the chip.  The chip is a pointer — the BHC app calls the API to
  resolve patient data after the tap, so stolen/cloned chips cannot expose
  patient information.

SDP Reference: Section 6.6 (Health Cards), Section 8 (Security)
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError

if TYPE_CHECKING:
    from app.models.health_card import HealthCard


def build_nfc_payload(patient_id: str, card_version: int) -> dict[str, str | int]:
    """
    Build the minimal JSON payload written to the physical NFC chip.

    The chip receives this JSON as an NDEF Text record.  The mobile app reads
    it, extracts patient_id, and calls the verify endpoint.

    Args:
        patient_id:   UUID string (never include name, DOB, or any other PHI).
        card_version: Current card version integer.

    Returns:
        {"patient_id": "<uuid>", "card_version": <int>}

    Security invariant: This function must NEVER include any PHI key.
    """
    return {
        "patient_id": patient_id,
        "card_version": card_version,
    }


async def link_nfc_uid(
    db: AsyncSession,
    patient_id: uuid.UUID,
    nfc_uid: str,
) -> HealthCard:
    """
    Bind a physical NFC chip's hardware UID to the patient's active health card.

    The NFC chip UID is the hardware identifier of the physical chip (e.g.
    "04:1A:2B:3C:4D:5E:6F").  Binding it to the card row allows the verify
    endpoint to look up the card by scanning the chip, without writing any
    patient data to the chip.

    Steps:
    1. Load the active health_card for patient_id.
    2. Check the nfc_uid is not already bound to a DIFFERENT card (conflict).
    3. Set health_cards.nfc_uid = nfc_uid and commit.

    Args:
        db:         Active async database session.
        patient_id: UUID of the patient whose card should be updated.
        nfc_uid:    Hardware UID string read from the physical NFC chip.

    Returns:
        Updated HealthCard ORM instance.

    Raises:
        NotFoundError:  No active health card found for the patient.
        ConflictError:  The nfc_uid is already bound to a different card.
    """
    # Import inside function to avoid circular imports at module load time.
    from app.models.health_card import HealthCard  # noqa: PLC0415

    # Load the active card for this patient.
    result = await db.execute(
        select(HealthCard).where(
            HealthCard.patient_id == patient_id,
            HealthCard.status == "active",
        )
    )
    card: HealthCard | None = result.scalar_one_or_none()

    if card is None:
        raise NotFoundError(
            f"No active health card found for patient {patient_id}. "
            "Generate a card first before linking an NFC tag."
        )

    # Conflict check: is the nfc_uid already bound to a DIFFERENT card?
    conflict_result = await db.execute(
        select(HealthCard).where(
            HealthCard.nfc_uid == nfc_uid,
        )
    )
    existing_card: HealthCard | None = conflict_result.scalar_one_or_none()

    if existing_card is not None and existing_card.id != card.id:
        raise ConflictError(
            f"NFC UID '{nfc_uid}' is already bound to a different health card. "
            "Each NFC chip can only be associated with one card at a time."
        )

    # Bind the UID.
    card.nfc_uid = nfc_uid
    await db.commit()
    await db.refresh(card)

    return card
