"""
Pydantic v2 schemas for HealthCard request/response serialization.

Security notes
--------------
- No schema in this file includes PHI beyond the minimal PatientVerifySummary
  fields (patient_code, full_name, age, sex, priority flags).
- The QR payload and NFC payload schemas encode ONLY patient_id and
  card_version — never name, DOB, diagnosis, or any other PHI.
- HealthCardResponse includes qr_data_uri only on generate/reissue responses;
  it is NOT included on metadata-only GET responses (frontend regenerates
  QR preview via qrGenerator.worker.ts using patient_id + card_version).

SDP Reference: Section 6.6
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas._base import BaseSchema


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class NfcLinkRequest(BaseSchema):
    """
    POST /health-cards/{patient_id}/nfc-link

    Body sent by the BHW when provisioning a physical NFC chip.
    """

    nfc_uid: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Hardware UID of the physical NFC chip (e.g. '04:1A:2B:3C:4D:5E:6F')",
    )


class CardVerifyRequest(BaseSchema):
    """
    POST /health-cards/verify

    The frontend sends either qr_payload (scanned URL string) or nfc_uid
    (from a physical tap) — or both.  At least one field must be present.

    Security note: never echo back the qr_payload or nfc_uid in the response.
    """

    qr_payload: str | None = Field(
        None,
        description="Raw QR payload URL string (contains only patient_id, card_version, sig)",
    )
    nfc_uid: str | None = Field(
        None,
        max_length=64,
        description="Hardware UID read from the tapped NFC chip",
    )


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class HealthCardResponse(BaseSchema):
    """
    Returned by generate, reissue, get, and nfc-link endpoints.

    qr_data_uri is only populated by generate and reissue responses; it
    contains the base64 QR image so the frontend can display it immediately
    without a second round-trip.  GET /health-cards/{id} omits it (None).

    NEVER add name, address, birth_date, philhealth_no, or diagnosis here.
    """

    id: str
    patient_id: str
    card_number: str
    card_version: int
    status: Literal["active", "lost", "reissued", "revoked"]
    issued_at: datetime
    expires_at: datetime | None = None
    nfc_uid: str | None = None

    # Populated only on generate/reissue (not on GET metadata requests)
    qr_data_uri: str | None = Field(
        None,
        description="data:image/png;base64,... QR code image — only present on card generation/reissue",
    )


class CardGenerateResponse(BaseSchema):
    """
    Full response for POST .../generate and POST .../reissue.

    Bundles card metadata, the QR image data URI (for immediate display),
    and the NFC payload dict (to write to the physical chip).
    """

    card: HealthCardResponse
    # base64 PNG data URI — display immediately, no second round-trip needed
    qr_data_uri: str = Field(
        description="data:image/png;base64,... — QR code for the card front"
    )
    # Minimal JSON to write to the NFC chip
    nfc_payload: dict[str, str | int] = Field(
        description="{'patient_id': str, 'card_version': int} — write to NFC chip NDEF record"
    )


class PatientVerifySummary(BaseSchema):
    """
    Returned by POST /health-cards/verify on successful card verification.

    This is the ONLY patient data the verify endpoint ever returns.
    Deliberately minimal — front-desk staff need to confirm identity and
    see priority flags, nothing more.

    Fields intentionally omitted:
      - address, guardian info, mobile number (not needed at the desk)
      - philhealth_no (sensitive financial data)
      - medical_history, diagnosis (clinical PHI)
      - birth_date (derivable from age — not needed at this screen)
    """

    patient_code: str = Field(description="e.g. BHC-2026-000042")
    full_name: str = Field(description="Formatted: 'First [Middle] Last'")
    age: int = Field(ge=0, description="Age in whole years")
    sex: str = Field(description="'male' or 'female'")
    is_senior: bool = Field(description="Age ≥ 60 — priority queue flag")
    is_pwd: bool = Field(description="Person with Disability — priority queue flag")
    is_pregnant: bool = Field(description="Current pregnancy status")
    last_visit_date: datetime | None = Field(
        None, description="Timestamp of the most recent visit record, or None"
    )
    card_status: str = Field(description="'active', 'lost', 'reissued', or 'revoked'")
