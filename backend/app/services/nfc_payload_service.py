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


def build_nfc_payload(
    patient_id: str,
    card_version: int,
    card_number: str = "",
) -> dict[str, str | int]:
    """
    Build the minimal JSON payload written to the physical NFC chip.

    The NFC chip is intentionally a pointer-only payload. It stores only the
    patient UUID and the card version, never any PHI or human-readable
    identifiers. The caller may still pass ``card_number`` for convenience, but
    it is intentionally omitted from the serialized payload to preserve the
    PHI-free invariant enforced by the tests and the security spec.
    """
    return {
        "patient_id": patient_id,
        "card_version": card_version,
    }


# ---------------------------------------------------------------------------
# Signed NFC view links
# ---------------------------------------------------------------------------
# The URL written to a chip is {NFC_VIEW_BASE_URL}/view/{card_number}?sig=...
# Card numbers are sequential (BHC-2026-000001), so the signature is what stops
# anyone from guessing links to other patients' clinical summaries.
#
# The HMAC uses QR_HMAC_SECRET with an "nfc-view:" prefix (domain separation:
# a QR signature can never be replayed as an NFC signature or vice versa) and
# is truncated to 128 bits so the full URL still fits on small NTAG213 chips.
_NFC_SIG_HEX_LEN = 32


def sign_nfc_identifier(identifier: str) -> str:
    """Return the hex signature for a card number used in an NFC view link."""
    import hashlib  # noqa: PLC0415
    import hmac  # noqa: PLC0415

    from app.core.config import settings  # noqa: PLC0415

    message = f"nfc-view:{identifier}".encode()
    digest = hmac.new(settings.QR_HMAC_SECRET.encode("utf-8"), message, hashlib.sha256)
    return digest.hexdigest()[:_NFC_SIG_HEX_LEN]


def verify_nfc_signature(identifier: str, sig: str | None) -> bool:
    """Constant-time check of an NFC view link signature."""
    import hmac  # noqa: PLC0415

    if not sig:
        return False
    expected = sign_nfc_identifier(identifier)
    try:
        return hmac.compare_digest(expected.encode("ascii"), sig.strip().lower().encode("ascii"))
    except (ValueError, TypeError, UnicodeEncodeError):
        return False


def build_nfc_view_url(card_number: str) -> str:
    """
    Build the signed URL written to the NFC chip's NDEF URI record.

    Contains only the card number pointer and its signature — no PHI.
    """
    from urllib.parse import quote  # noqa: PLC0415

    from app.core.config import settings  # noqa: PLC0415

    base = settings.NFC_VIEW_BASE_URL.rstrip("/")
    return f"{base}/view/{quote(card_number, safe='')}?sig={sign_nfc_identifier(card_number)}"


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
