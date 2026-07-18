"""
Health card generation, retrieval, and verification endpoints (Phase 3 stubs).

Routes use full paths and are mounted without a prefix on the API router.

  POST /health-cards/{patient_id}/generate  — generate / regenerate card (QR + NFC payload)
  GET  /health-cards/{patient_id}           — get card metadata
  GET  /health-cards/{patient_id}/pdf       — render + stream printable PDF card
  POST /health-cards/{patient_id}/nfc-link  — bind a physical NFC tag UID to the card
  POST /health-cards/verify                 — verify scanned QR payload or tapped NFC UID
  POST /health-cards/{patient_id}/reissue   — reissue lost/damaged card (bumps card_version)

SECURITY INVARIANT: No PHI is ever encoded in the QR payload or written to
the NFC chip.  The QR payload contains only:
  - patient_id (UUID)
  - card_version (integer)
  - HMAC-SHA256 signature (keyed with QR_HMAC_SECRET from settings)

Any code that attempts to embed names, dates of birth, diagnoses, or other
PHI into the card payload MUST be rejected and flagged as a security defect.

SDP Reference: Section 6.6, Section 8
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter

router = APIRouter(tags=["health-cards"])


@router.post(
    "/health-cards/{patient_id}/generate",
    summary="Generate or regenerate health card (QR + NFC payload)",
    status_code=201,
)
async def generate_health_card(patient_id: uuid.UUID) -> dict[str, str]:
    """
    Generates a new health card for the patient:
      1. Computes the HMAC-signed QR payload (patient_id + card_version only).
      2. Stores card metadata in the health_cards table.
      3. Returns card metadata and the QR payload string.

    If a card already exists, a new card_version is issued (old card remains
    in DB for audit; status set to 'reissued').

    Auth: BHW, Physician, Admin Staff, Admin.
    Full implementation: Phase 3 — Health Cards.
    """
    return {"message": f"TODO: Phase 3 — generate health card for patient {patient_id}"}


@router.get(
    "/health-cards/{patient_id}",
    summary="Get health card metadata for a patient",
)
async def get_health_card(patient_id: uuid.UUID) -> dict[str, str]:
    """
    Returns current card metadata: card_number, card_version, status,
    issued_at, expires_at.  Does NOT return the QR payload or NFC data.

    Auth: JWT required.
    Full implementation: Phase 3 — Health Cards.
    """
    return {"message": f"TODO: Phase 3 — get health card for patient {patient_id}"}


@router.get(
    "/health-cards/{patient_id}/pdf",
    summary="Render and download the printable PDF health card",
)
async def download_health_card_pdf(patient_id: uuid.UUID) -> dict[str, str]:
    """
    Renders the health card front + back as a PDF using WeasyPrint and
    streams it as a downloadable file response.

    The rendered PDF includes the QR code image and patient demographics
    (name, patient_code, blood type if available) but NOT encrypted PHI.

    Auth: JWT required.
    Full implementation: Phase 3 — Health Cards.
    """
    return {"message": f"TODO: Phase 3 — download PDF for patient {patient_id}"}


@router.post(
    "/health-cards/{patient_id}/nfc-link",
    summary="Bind a physical NFC tag UID to the patient's health card",
)
async def link_nfc_tag(patient_id: uuid.UUID) -> dict[str, str]:
    """
    Associates a physical NFC chip's UID with the patient's active health card.

    The NFC chip stores only the patient_id.  This endpoint binds the chip's
    hardware UID (nfc_uid) to the health_cards row so the card can be verified
    by tapping.

    Auth: BHW, Physician, Admin Staff, Admin.
    Full implementation: Phase 3 — Health Cards.
    """
    return {"message": f"TODO: Phase 3 — link NFC tag for patient {patient_id}"}


@router.post(
    "/health-cards/verify",
    summary="Verify a scanned QR payload or tapped NFC UID",
)
async def verify_health_card() -> dict[str, str]:
    """
    Accepts either:
      - A QR payload string (HMAC-signed) → validates the signature and
        returns the patient summary if valid.
      - An NFC UID string → looks up the bound card and returns the patient
        summary if the card is active.

    Writes a card_verifications audit record on every call (success or fail).

    Auth: JWT required.
    Full implementation: Phase 3 — Health Cards.
    """
    return {"message": "TODO: Phase 3 — verify health card (QR or NFC)"}


@router.post(
    "/health-cards/{patient_id}/reissue",
    summary="Reissue a lost or damaged health card",
)
async def reissue_health_card(patient_id: uuid.UUID) -> dict[str, str]:
    """
    Marks the current card as 'lost' or 'reissued', increments card_version,
    and generates a new card with a fresh HMAC-signed QR payload.

    The old card's QR payload becomes invalid (HMAC will no longer verify
    because card_version in the payload won't match the DB record).

    Auth: BHW, Physician, Admin Staff, Admin.
    Full implementation: Phase 3 — Health Cards.
    """
    return {"message": f"TODO: Phase 3 — reissue health card for patient {patient_id}"}
