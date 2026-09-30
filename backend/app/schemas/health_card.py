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

import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

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


class BatchPdfRequest(BaseSchema):
    """
    POST /health-cards/batch-pdf

    Body sent by admin or BHW staff to generate a single multi-page PDF
    containing the health cards for the specified patients.

    Constraints:
    - min_length=1: at least one patient_id must be supplied.
    - max_length=50: cap imposed to bound WeasyPrint memory usage per request.
      Attempting to supply 51+ patient_ids will fail Pydantic validation with
      HTTP 422 before any DB queries are executed.

    Security note: Only admin and bhw roles may call this endpoint.
    One audit_log row is written per request (not per patient_id).
    """

    patient_ids: list[uuid.UUID] = Field(
        ...,
        min_length=1,
        max_length=50,
        description=(
            "List of patient UUIDs whose health cards should be included in the "
            "batch PDF.  Must contain 1–50 entries.  Patients without an active "
            "health card are silently skipped."
        ),
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


class HealthCardMaybeResponse(BaseSchema):
    """
    Returned by GET /health-cards/{patient_id}?allow_missing=true.

    When a patient has no health card yet, ``card_found`` is False and
    ``card`` is None — and the endpoint returns HTTP 200 instead of 404.
    This prevents the browser console from logging network errors for
    patients who simply haven't been issued a card yet, which is normal
    during the card-management list view.

    Callers that need a hard 404 (e.g. the print page) should omit the
    ``allow_missing`` query parameter — the default behavior is unchanged.
    """

    card_found: bool = Field(description="True when a card row exists for this patient.")
    card: HealthCardResponse | None = Field(
        None,
        description="Card metadata — None when card_found is False.",
    )


class CardGenerateResponse(BaseSchema):
    """
    Full response for POST .../generate and POST .../reissue.

    Bundles card metadata, the QR image data URI (for immediate display),
    and the NFC payload dict (to write to the physical chip).
    """

    card: HealthCardResponse
    # The signed URL encoded inside the QR image — useful for testing in Swagger UI
    signed_url: str = Field(
        description="Full HMAC-signed URL encoded in the QR code, e.g. http://host/verify?pid=...&v=...&sig=..."
    )
    # base64 PNG data URI — display immediately, no second round-trip needed
    qr_data_uri: str = Field(description="data:image/png;base64,... — QR code for the card front")
    # JSON to write to the NFC chip + NDEF URI record for NFC Tools
    nfc_payload: dict[str, str | int] = Field(
        description=(
            "{'patient_id': str, 'card_number': str, 'card_version': int, "
            "'view_url': str} — write view_url as the NFC chip NDEF URI record "
            "so NFC Tools triggers GET /view/{card_number} on tap."
        )
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


class PatientVerifySummaryFull(PatientVerifySummary):
    """
    Extended verify response returned when ``full=true`` is passed to
    POST /health-cards/verify by authenticated staff.

    Includes additional PHI fields needed to render the Patient Quick View
    screen (navigation links, photo, contact number, formatted birth date).
    Access is gated behind JWT auth + audit log exactly like any PHI view.

    Fields added beyond PatientVerifySummary:
      - patient_id:    UUID string — used to build navigation links to the
                       full patient record, new visit, and appointment booking.
      - birth_date:    ISO date string "YYYY-MM-DD" — for formatted display.
      - mobile_number: Contact number (may be null).
      - photo_url:     Relative URL "/media/patient_photos/<uuid>.jpg" or None.
                       Frontend constructs the absolute URL by prepending the
                       API base host.  Never contains a full backend URL so
                       the value remains environment-agnostic.

    Security note: This schema is only returned on authenticated calls with
    full=true.  The PHI-VIEW audit log entry is written before the response
    is sent so the disclosure is always traceable.
    """

    patient_id: str = Field(description="Patient UUID string — for navigation links")
    birth_date: str = Field(description="ISO date 'YYYY-MM-DD'")
    mobile_number: str | None = Field(None, description="Patient contact number")
    photo_url: str | None = Field(
        None,
        description="Relative URL path '/media/patient_photos/<uuid>.jpg' or None",
    )


class CardGenerationAccepted(BaseSchema):
    """
    Returned by POST /health-cards/{patient_id}/generate when the PDF
    generation task is dispatched to Celery (HTTP 202 Accepted).

    The caller should poll GET /health-cards/generation-status/{card_id}
    until status transitions to "ready" or "failed".
    """

    card_id: str = Field(description="UUID of the newly created or existing HealthCard row.")
    task_id: str = Field(
        description="Celery task ID — for monitoring via Flower or the status endpoint."
    )
    status: str = Field(default="pending", description="Always 'pending' at dispatch time.")


class CardGenerationStatus(BaseSchema):
    """
    Returned by GET /health-cards/generation-status/{card_id}.

    status values:
      "pending" — task queued or in progress.
      "ready"   — PDF is on disk; pdf_url points to the relative file path.
      "failed"  — PDF generation failed; retry by calling generate again.
    """

    card_id: str = Field(description="UUID of the HealthCard row.")
    status: str = Field(description="'pending' | 'ready' | 'failed'")
    pdf_url: str | None = Field(
        None,
        description=(
            "Relative path to the rendered PDF (e.g. 'health_cards/<card_id>.pdf'). "
            "Populated only when status='ready'.  Prefix with the API host to "
            "form an absolute download URL."
        ),
    )


class PublicVerifyResponse(BaseSchema):
    """
    Returned by GET /health-cards/verify/public — the unauthenticated endpoint
    that mobile phones land on after scanning the health card QR code.

    Intentionally minimal: only enough to confirm the card is genuine.
    No age, sex, priority flags, or visit history exposed to anonymous callers.
    """

    valid: bool = Field(description="True if the HMAC signature is valid and the card is active.")
    full_name: str | None = Field(None, description="Patient name — only set when valid=True.")
    patient_code: str | None = Field(
        None, description="e.g. BHC-2026-000042 — only set when valid=True."
    )
    card_status: str | None = Field(
        None, description="'active', 'reissued', etc. — only set when valid=True."
    )


# ---------------------------------------------------------------------------
# NFC Batch Export schemas (GET /health-cards/nfc-batch)
# ---------------------------------------------------------------------------


class NfcBatchItem(BaseSchema):
    """
    A single entry in the NFC batch export payload.

    Security invariant: ``nfc_uri`` is the NDEF URI record string written
    to the physical chip.  It contains ONLY the health card view URL
    (card_number pointer) — no PHI such as name, birth date, or diagnosis.

    The ``patient_id`` field is included so the Android batch-write app can
    correlate the write result back to a patient row without re-fetching the
    full patient list.  The app MUST NOT display ``patient_id`` on any
    patient-facing screen.
    """

    patient_id: uuid.UUID = Field(
        description="Patient UUID — for correlation only; do not display to patients."
    )
    card_version: int = Field(
        description="Current card version integer matching the HMAC used in the QR code."
    )
    nfc_uri: str = Field(
        description=(
            "NDEF URI string to write to the physical NFC chip, e.g. "
            "'http://192.168.100.6:9000/view/BHC-2026-000001'.  "
            "Contains only the card_number pointer — no PHI."
        )
    )


class NfcBatchResponse(BaseSchema):
    """
    Returned by GET /health-cards/nfc-batch.

    Provides all NDEF URI payloads needed for a batch NFC chip-writing
    session (e.g. a health drive with 50+ patients).  An Android batch-write
    app fetches this once, caches it locally, and writes chips sequentially
    without further network calls during the write session.
    """

    items: list[NfcBatchItem] = Field(description="Ordered list of NFC payloads to write.")
    total: int = Field(description="Number of items returned (len(items)).")
    barangay_filter: str | None = Field(
        None,
        description="The barangay filter applied to this batch, or None if no filter was requested.",
    )


# ---------------------------------------------------------------------------
# Bulk card status schemas (POST /health-cards/status-bulk)
# ---------------------------------------------------------------------------


class CardStatusItem(BaseSchema):
    """
    Status summary for a single patient's health card.

    Contains only card metadata (status, card_number, card_id, card_version) —
    no PHI beyond what is already visible in the card management list view.
    Used by POST /health-cards/status-bulk to return per-patient card
    status in a single bulk response, eliminating the N+1 fetch pattern.
    """

    patient_id: uuid.UUID = Field(description="Patient UUID this status item belongs to.")
    status: str = Field(
        description="Card status: 'active', 'lost', 'reissued', 'revoked', or 'none'."
    )
    card_number: str | None = Field(
        None, description="Card number (e.g. SH-2026-000001), or None if no card exists."
    )
    card_id: uuid.UUID | None = Field(
        None, description="Health card UUID, or None if no card exists."
    )
    card_version: int | None = Field(
        None, description="Card version integer, or None if no card exists."
    )


class BulkCardStatusRequest(BaseSchema):
    """
    Request body for POST /health-cards/status-bulk.

    Limited to 100 patient IDs per call to bound query size and response
    payload.  A standard page of 15 rows is well within this limit.
    """

    patient_ids: list[uuid.UUID] = Field(
        ...,
        description="List of patient UUIDs to look up.  1–100 entries.",
    )

    @field_validator("patient_ids")
    @classmethod
    def validate_patient_ids(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(v) > 100:
            raise ValueError("Cannot request status for more than 100 patients at once.")
        return v


class BulkCardStatusResponse(BaseSchema):
    """
    Response body for POST /health-cards/status-bulk.

    One CardStatusItem is returned per patient_id in the request.
    Patients without a card row receive status='none'.
    """

    items: list[CardStatusItem] = Field(description="One status entry per requested patient_id.")


# ---------------------------------------------------------------------------
# Batch card generation schemas (POST /health-cards/batch-generate,
#                                 GET  /health-cards/batch-status/{batch_id})
# ---------------------------------------------------------------------------


class BatchGenerateRequest(BaseSchema):
    """
    POST /health-cards/batch-generate

    Enqueues a Celery card-generation task for each patient_id.
    Capped at 100 to bound Redis key fan-out and Celery queue pressure.

    Security note: Only BHW+ roles may call this endpoint.
    One audit_log row per batch request is written by the endpoint.
    Task args contain ONLY UUIDs — no PHI in Celery task arguments.
    """

    patient_ids: list[uuid.UUID] = Field(
        ...,
        description=(
            "List of patient UUIDs to generate cards for.  "
            "Must contain 1–100 entries.  Patients who already have an active "
            "card will have it regenerated (idempotent — same card_number "
            "returned by generate_card())."
        ),
    )

    @field_validator("patient_ids")
    @classmethod
    def validate_patient_ids(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(v) == 0:
            raise ValueError("At least one patient_id must be supplied.")
        if len(v) > 100:
            raise ValueError("Cannot generate more than 100 cards in a single batch.")
        return v


class BatchGenerateResponse(BaseSchema):
    """
    Returned by POST /health-cards/batch-generate immediately after all
    Celery tasks have been enqueued (HTTP 202 Accepted).

    The caller should poll GET /health-cards/batch-status/{batch_id} every
    2 seconds until completed + failed == total.
    """

    batch_id: str = Field(
        description="UUID string identifying this batch run — use to poll batch-status."
    )
    total: int = Field(description="Number of card-generation tasks enqueued (one per patient_id).")


class BatchStatusResult(BaseSchema):
    """
    Per-patient result item returned inside BatchStatusResponse.

    status is either 'success' or 'failed'.  When failed, the error field
    contains a short (≤100 char) description of what went wrong.  When the
    task has not yet completed, the entry will not appear in the results list
    (only completed tasks are included).
    """

    patient_id: uuid.UUID = Field(description="Patient UUID this result belongs to.")
    status: str = Field(description="'success' or 'failed'.")
    error: str | None = Field(
        None,
        description="Short error description — only set when status='failed'.",
    )


class BatchStatusResponse(BaseSchema):
    """
    Returned by GET /health-cards/batch-status/{batch_id}.

    Poll this endpoint every 2 seconds until completed + failed == total,
    at which point all tasks have finished and the batch is complete.
    """

    batch_id: str = Field(description="The batch identifier.")
    total: int = Field(description="Total number of tasks in the batch.")
    completed: int = Field(description="Number of tasks that completed successfully.")
    failed: int = Field(description="Number of tasks that failed.")
    results: list[BatchStatusResult] = Field(
        description="Per-patient results for tasks that have completed or failed."
    )
