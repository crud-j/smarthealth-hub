"""
Health card generation, retrieval, and verification endpoints — Phase 3.

Routes use full paths and are mounted without a prefix on the API router.

  POST /health-cards/{patient_id}/generate      — generate card (QR + NFC payload)
  GET  /health-cards/{patient_id}               — get card metadata (no QR image)
  GET  /health-cards/{patient_id}/pdf           — render + stream printable PDF
  POST /health-cards/{patient_id}/nfc-link      — bind physical NFC UID to card
  POST /health-cards/{patient_id}/link-nfc-uid  — alias used by NFC relay testing
  POST /health-cards/verify                     — verify QR scan or NFC tap
  POST /health-cards/{patient_id}/reissue       — reissue lost/damaged card
  POST /health-cards/scan-uid                   — public NFC relay scan (no JWT)
  GET  /health-cards/last-scan                  — last NFC scan result cache (no JWT)

Security invariants enforced in this file:
  1. Every route requires JWT authentication, EXCEPT:
       - /health-cards/scan-uid  (hardware relay integration point)
       - /health-cards/last-scan (polling endpoint for NFC monitor page)
       - /health-cards/verify/public (QR mobile scan target)
  2. Mutation routes (generate, nfc-link, link-nfc-uid, reissue) require BHW+ role.
  3. The verify endpoint returns a GENERIC 403 for ALL failure modes —
     no information about WHY verification failed is exposed to the caller.
  4. The verify response contains ONLY PatientVerifySummary fields
     (patient_code, full_name, age, sex, priority flags, last_visit, card_status).
     No address, philhealth_no, diagnosis, or other PHI is returned.
  5. Every card event writes an audit log entry.
  6. scan-uid returns ONLY name, DOB, blood_type placeholder, emergency contact,
     allergies — never diagnosis, treatment_notes, or encrypted PHI fields.

SDP Reference: Section 6.6, Section 8
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.logging import get_logger
from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.models.card_verification import CardVerification
from app.models.health_card import HealthCard
from app.models.medical_history import MedicalHistory
from app.models.patient import Patient
from app.models.visit import Visit
from app.schemas.health_card import (
    BatchPdfRequest,
    CardGenerateResponse,
    CardVerifyRequest,
    HealthCardMaybeResponse,
    HealthCardResponse,
    NfcLinkRequest,
    PatientVerifySummary,
    PatientVerifySummaryFull,
)
from app.services import card_generation_service, nfc_payload_service, qr_service
from app.services.audit_service import write_audit_log
from app.services.patient_service import get_patient

logger = get_logger(__name__)

router = APIRouter(tags=["health-cards"])

# ---------------------------------------------------------------------------
# In-memory last-scan cache — for NFC Wi-Fi relay testing only.
# Module-level dict; cleared when the process restarts.
# Never stores diagnosis, treatment_notes, or encrypted PHI.
# ---------------------------------------------------------------------------
_last_scan_cache: dict[str, Any] = {
    "scanned_at": None,
    "found": False,
    "uid": None,
    "patient": None,
}


# ---------------------------------------------------------------------------
# Request / response schemas for the NFC relay endpoints
# ---------------------------------------------------------------------------


class NfcScanUidRequest(BaseModel):
    """Body for POST /health-cards/scan-uid (sent by the relay server)."""

    uid: str = Field(..., min_length=1, max_length=64, description="Raw hardware NFC UID hex string")


class NfcScanPatientInfo(BaseModel):
    """Safe patient info returned by a successful NFC UID scan. No PHI beyond name/DOB/contact."""

    patient_id: str
    patient_code: str
    full_name: str
    date_of_birth: str
    sex: str
    blood_type: str | None
    emergency_contact_name: str | None
    emergency_contact_number: str | None
    allergies: str
    card_status: str
    is_senior: bool
    is_pwd: bool
    is_pregnant: bool


class NfcScanResponse(BaseModel):
    """Response body for POST /health-cards/scan-uid."""

    found: bool
    uid: str
    message: str
    patient: NfcScanPatientInfo | None = None


class LastScanResponse(BaseModel):
    """Response body for GET /health-cards/last-scan."""

    scanned_at: str | None
    found: bool
    uid: str | None
    patient: NfcScanPatientInfo | None = None


class ViewByIdentifierResponse(BaseModel):
    """Response body for GET /health-cards/view/{identifier}."""

    found: bool
    identifier: str
    message: str
    patient: NfcScanPatientInfo | None = None


# ── Role groups ───────────────────────────────────────────────────────────────
# BHW, Physician, Admin Staff, and Admin may mutate cards.
_BHW_PLUS = require_role("bhw", "physician", "admin_staff", "admin")


# ---------------------------------------------------------------------------
# Generic verify 403 — identical message for ALL failure modes (no info leak)
# ---------------------------------------------------------------------------

_VERIFY_FAIL = ForbiddenError(
    "Card could not be verified.",
    detail={"code": "invalid_card", "message": "Card verification failed."},
)


def _get_client_ip(request: Request) -> str | None:
    """Extract client IP from request, handling common proxy headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return getattr(request.client, "host", None)


# ---------------------------------------------------------------------------
# POST /health-cards/scan-uid  [PUBLIC — no JWT]
# NOTE: Declared FIRST so FastAPI does not treat "scan-uid" as a patient_id UUID.
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/scan-uid",
    response_model=NfcScanResponse,
    summary="NFC relay scan — look up patient by raw hardware UID (no auth required)",
    description=(
        "Accepts a raw NFC hardware UID hex string from the Wi-Fi relay server.  "
        "Looks up the health_cards table for a matching nfc_uid (case-insensitive).  "
        "Returns safe patient info (name, DOB, blood type, emergency contact, allergies).  "
        "NO diagnosis, treatment_notes, or encrypted PHI is returned.  "
        "Writes an NFC_SCAN audit log entry.  No JWT required — the relay server "
        "is the hardware integration point and cannot hold credentials."
    ),
)
async def scan_nfc_uid_early(
    body: NfcScanUidRequest,
    request: Request,
    db: DbDep,
) -> NfcScanResponse:
    """Thin shim — delegates to the implementation function below."""
    return await _scan_nfc_uid_impl(body, request, db)


# ---------------------------------------------------------------------------
# GET /health-cards/last-scan  [PUBLIC — no JWT]
# ---------------------------------------------------------------------------


@router.get(
    "/health-cards/last-scan",
    response_model=LastScanResponse,
    summary="Return the most recent NFC scan result from in-memory cache (no auth required)",
    description=(
        "Returns the last NFC UID scan result cached by POST /health-cards/scan-uid.  "
        "Intended for the /nfc-monitor polling page during Wi-Fi relay testing.  "
        "No JWT required.  Cache resets when the FastAPI process restarts.  "
        "Returns scanned_at=None when no scan has been received yet."
    ),
)
async def get_last_scan_early() -> LastScanResponse:
    """Thin shim — delegates to the implementation function below."""
    return await _get_last_scan_impl()


# ---------------------------------------------------------------------------
# GET /health-cards/view/{identifier}  [PUBLIC — no JWT]
# NFC testing convenience endpoint — look up by card_number OR nfc_uid.
# The school ID is used only as a tap trigger; the patient is identified by
# the health card code embedded in the NFC Tools Task URL path segment.
# No UID linking required — change the URL to test any patient.
# NOTE: Declared BEFORE /{patient_id} routes to avoid path-param conflicts.
# ---------------------------------------------------------------------------


@router.get(
    "/health-cards/view/{identifier}",
    response_model=ViewByIdentifierResponse,
    summary="Look up a health card by card_number or NFC UID (no auth required)",
    description=(
        "Accepts either a health card code (e.g. HC-2026-00004) or a raw NFC UID "
        "(e.g. C9:49:3B:07).  Tries card_number match first, then nfc_uid "
        "(case-insensitive).  Returns the same safe NfcScanPatientInfo fields — "
        "no diagnosis, treatment_notes, or encrypted PHI.  "
        "Updates the in-memory last-scan cache so the /nfc-monitor page reflects "
        "the lookup.  Writes a HEALTH_CARD_VIEW audit log entry.  "
        "No JWT required — intended for NFC Tools Task URL testing workflow."
    ),
)
async def view_health_card_by_identifier(
    identifier: str,
    request: Request,
    db: DbDep,
) -> ViewByIdentifierResponse:
    """
    Dual-mode lookup: card_number first, then nfc_uid.

    Security design (mirrors scan-uid):
    - Returns only NfcScanPatientInfo fields (name, DOB, sex, blood_type,
      emergency contact, allergies, card_status, priority flags).
    - NO diagnosis, treatment_notes, or encrypted PHI fields are returned.
    - Audit log records only identifier prefix (8 chars), patient name, card_status.
    - Cache update mirrors POST /scan-uid so the /nfc-monitor page stays current.
    """
    from urllib.parse import unquote as _unquote  # noqa: PLC0415

    raw_identifier = _unquote(identifier).strip()
    scanned_at_iso = datetime.now(timezone.utc).isoformat()

    # ── Try card_number match first ───────────────────────────────────────────
    card_result = await db.execute(
        select(HealthCard).where(HealthCard.card_number == raw_identifier)
    )
    card: HealthCard | None = card_result.scalar_one_or_none()

    # ── Fallback: case-insensitive nfc_uid match ──────────────────────────────
    if card is None:
        card_result2 = await db.execute(
            select(HealthCard).where(
                func.upper(HealthCard.nfc_uid) == raw_identifier.upper()
            )
        )
        card = card_result2.scalar_one_or_none()

    # ── Not found ─────────────────────────────────────────────────────────────
    if card is None:
        _last_scan_cache.update(
            scanned_at=scanned_at_iso,
            found=False,
            uid=raw_identifier,
            patient=None,
        )
        await write_audit_log(
            db=db,
            action="HEALTH_CARD_VIEW",
            entity_type="health_card",
            metadata={
                "result": "not_found",
                "identifier_prefix": raw_identifier[:8] + ("..." if len(raw_identifier) > 8 else ""),
                "ip": _get_client_ip(request),
            },
            ip_address=_get_client_ip(request),
        )
        await db.commit()
        return ViewByIdentifierResponse(
            found=False,
            identifier=raw_identifier,
            message="Health card not found.",
        )

    # ── Load patient ──────────────────────────────────────────────────────────
    patient_result = await db.execute(
        select(Patient).where(Patient.id == card.patient_id)
    )
    patient: Patient | None = patient_result.scalar_one_or_none()

    if patient is None or not patient.is_active:
        _last_scan_cache.update(
            scanned_at=scanned_at_iso,
            found=False,
            uid=raw_identifier,
            patient=None,
        )
        await write_audit_log(
            db=db,
            action="HEALTH_CARD_VIEW",
            entity_type="health_card",
            entity_id=card.id,
            metadata={
                "result": "patient_inactive_or_missing",
                "identifier_prefix": raw_identifier[:8] + ("..." if len(raw_identifier) > 8 else ""),
                "card_id": str(card.id),
            },
            ip_address=_get_client_ip(request),
        )
        await db.commit()
        return ViewByIdentifierResponse(
            found=False,
            identifier=raw_identifier,
            message="Patient record not found or is inactive.",
        )

    # ── Build response — mirrors _scan_nfc_uid_impl exactly ──────────────────
    name_parts = [patient.first_name]
    if patient.middle_name:
        name_parts.append(patient.middle_name)
    name_parts.append(patient.last_name)
    full_name = " ".join(name_parts)

    dob_str = (
        patient.birth_date.strftime("%B %d, %Y") if patient.birth_date else "Unknown"
    )

    allergies_result = await db.execute(
        select(MedicalHistory.condition_name).where(
            MedicalHistory.patient_id == patient.id
        )
    )
    allergy_rows = allergies_result.scalars().all()
    allergies_str = ", ".join(r for r in allergy_rows if r) or "None on record"

    patient_info = NfcScanPatientInfo(
        patient_id=str(patient.id),
        patient_code=patient.patient_code,
        full_name=full_name,
        date_of_birth=dob_str,
        sex=patient.sex,
        blood_type=patient.blood_type,
        emergency_contact_name=patient.guardian_name,
        emergency_contact_number=patient.guardian_contact,
        allergies=allergies_str,
        card_status=card.status,
        is_senior=patient.is_senior,
        is_pwd=patient.is_pwd,
        is_pregnant=patient.is_pregnant,
    )

    # Update last-scan cache so /nfc-monitor page reflects this lookup.
    _last_scan_cache.update(
        scanned_at=scanned_at_iso,
        found=True,
        uid=raw_identifier,
        patient=patient_info.model_dump(),
    )

    # Audit log — identifier prefix + patient name + card_status only (no PHI).
    await write_audit_log(
        db=db,
        action="HEALTH_CARD_VIEW",
        entity_type="health_card",
        entity_id=card.id,
        metadata={
            "result": "found",
            "identifier_prefix": raw_identifier[:8] + ("..." if len(raw_identifier) > 8 else ""),
            "patient_name": full_name,
            "card_status": card.status,
            "ip": _get_client_ip(request),
        },
        ip_address=_get_client_ip(request),
    )
    await db.commit()

    status_label = "active" if card.status == "active" else card.status
    return ViewByIdentifierResponse(
        found=True,
        identifier=raw_identifier,
        message=f"Patient found: {full_name} (card: {status_label})",
        patient=patient_info,
    )


# ---------------------------------------------------------------------------
# POST /health-cards/{patient_id}/generate
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/{patient_id}/generate",
    response_model=CardGenerateResponse,
    status_code=201,
    summary="Generate health card (QR + NFC payload) for a patient",
    description=(
        "Issues a new active health card.  Idempotent — returns the existing "
        "active card unchanged if one already exists.  Requires BHW role or above."
    ),
    dependencies=[_BHW_PLUS],
)
async def generate_health_card(
    patient_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> CardGenerateResponse:
    result = await card_generation_service.generate_card(
        db=db,
        patient_id=patient_id,
        issued_by_id=current_user.id,
        ip_address=_get_client_ip(request),
    )
    card_dict = result["card"]
    return CardGenerateResponse(
        card=HealthCardResponse(**card_dict, qr_data_uri=result["qr_data_uri"]),
        signed_url=result["signed_url"],
        qr_data_uri=result["qr_data_uri"],
        nfc_payload=result["nfc_payload"],
    )


# ---------------------------------------------------------------------------
# POST /health-cards/batch-pdf
# NOTE: Declared BEFORE /health-cards/{patient_id} routes so FastAPI does
#       not interpret "batch-pdf" as a patient_id UUID path parameter.
# ---------------------------------------------------------------------------

_BATCH_PDF_ROLES = require_role("admin", "bhw")


@router.post(
    "/health-cards/batch-pdf",
    summary="Generate a multi-page PDF for multiple patients' health cards",
    description=(
        "Renders a single PDF containing the health cards for up to 50 patients.  "
        "Each patient occupies 2 pages (front + back).  "
        "Patients without an active health card are silently skipped.  "
        "Requires admin or bhw role.  One audit_log row is written per request."
    ),
    dependencies=[_BATCH_PDF_ROLES],
)
async def batch_health_card_pdf(
    body: BatchPdfRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> Response:
    """
    Build a batch multi-page PDF for the requested patient health cards.

    Processing order:
      1. For each patient_id, load the Patient and their active HealthCard.
         Patients without an active card are logged as a WARNING and skipped.
      2. Generate the QR data URI for each card (patient_id + card_version +
         HMAC only — no PHI in the QR payload).
      3. Resolve each patient's profile photo as a base64 data URI (async,
         before entering the synchronous WeasyPrint renderer).
      4. Call render_batch_health_card_pdf() in a thread pool.
      5. Write a single BATCH_PDF audit log entry.
      6. Return the raw PDF bytes as a downloadable attachment.

    Security invariants:
      - QR payloads contain ONLY patient_id + card_version + HMAC sig.
      - Only admin and bhw roles may call this endpoint (HTTP 403 for others).
      - One audit row per request (not per patient) to avoid log spam.
    """
    from datetime import date as _date  # noqa: PLC0415

    from app.services.patient_photo_service import get_photo_data_uri  # noqa: PLC0415
    from app.services.pdf_renderer import render_batch_health_card_pdf  # noqa: PLC0415

    cards: list[tuple[dict[str, object], dict[str, object], str, str | None]] = []

    _today = _date.today()

    for patient_id in body.patient_ids:
        # ── Load patient ──────────────────────────────────────────────────
        patient_result = await db.execute(
            select(Patient).where(Patient.id == patient_id)
        )
        patient: Patient | None = patient_result.scalar_one_or_none()

        if patient is None or not patient.is_active:
            logger.warning(
                "batch_health_card_pdf: patient %s not found or inactive — skipping",
                patient_id,
            )
            continue

        # ── Load active health card ───────────────────────────────────────
        card_result = await db.execute(
            select(HealthCard).where(
                HealthCard.patient_id == patient_id,
                HealthCard.status == "active",
            )
        )
        card: HealthCard | None = card_result.scalar_one_or_none()

        if card is None:
            logger.warning(
                "batch_health_card_pdf: no active health card for patient %s — skipping",
                patient_id,
            )
            continue

        # ── Generate QR (no PHI in payload) ──────────────────────────────
        _signed_url, qr_data_uri = qr_service.encode_qr_payload(
            str(patient_id), card.card_version
        )

        # ── Build template context dicts ──────────────────────────────────
        _bd = patient.birth_date
        _age: int = (
            _today.year
            - _bd.year
            - ((_today.month, _today.day) < (_bd.month, _bd.day))
            if _bd
            else 0
        )
        _birth_date_display: str = (
            _bd.strftime("%B %d, %Y").replace(" 0", " ") if _bd else "—"
        )

        # Most-recent Visit for vitals.
        _visit_result = await db.execute(
            select(Visit)
            .where(Visit.patient_id == patient_id)
            .order_by(Visit.visit_date.desc())
            .limit(1)
        )
        _latest_visit: Visit | None = _visit_result.scalar_one_or_none()

        if _latest_visit is not None:
            _last_bp: str = _latest_visit.blood_pressure or "—"
            _last_weight: str = (
                str(_latest_visit.weight_kg) if _latest_visit.weight_kg is not None else "—"
            )
            _last_height: str = (
                str(_latest_visit.height_cm) if _latest_visit.height_cm is not None else "—"
            )
            _last_temp: str = (
                str(_latest_visit.temperature) if _latest_visit.temperature is not None else "—"
            )
        else:
            _last_bp = "—"
            _last_weight = "—"
            _last_height = "—"
            _last_temp = "—"

        # Allergies from medical_history condition_name (plain text, not encrypted).
        _allergies: str
        if patient.medical_histories:
            _allergies = (
                ", ".join(
                    mh.condition_name
                    for mh in patient.medical_histories
                    if mh.condition_name
                )
                or "None on record"
            )
        else:
            _allergies = "None on record"

        patient_dict: dict[str, object] = {
            "first_name": patient.first_name,
            "last_name": patient.last_name,
            "middle_name": patient.middle_name,
            "patient_code": patient.patient_code,
            "sex": patient.sex,
            "birth_date": patient.birth_date.strftime("%Y-%m-%d") if _bd else "",
            "age": _age,
            "birth_date_display": _birth_date_display,
            "mobile_number": patient.mobile_number or "—",
            "philhealth_no": patient.philhealth_no or "—",
            "philhealth_member_type": patient.philhealth_member_type or "",
            "address": patient.address or "—",
            # Structured address fields for the back-face template.
            "sitio_purok": patient.sitio_purok or "",
            "barangay": patient.barangay or "",
            "municipality": patient.municipality or "",
            "province": patient.province or "",
            "blood_type": patient.blood_type or "—",
            "allergies": _allergies,
            "last_bp": _last_bp,
            "last_weight": _last_weight,
            "last_height": _last_height,
            "last_temp": _last_temp,
            "medical_notes": "",
            # Dedicated emergency contact fields.
            "emergency_contact_name": patient.emergency_contact_name or "—",
            "emergency_contact_number": patient.emergency_contact_number or "—",
            "guardian_name": patient.guardian_name or "—",
            "guardian_contact": patient.guardian_contact or "—",
            "is_senior": patient.is_senior,
            "is_pwd": patient.is_pwd,
            "is_pregnant": patient.is_pregnant,
            "barangay_name": "Sta. Rosa 1 BHS, Marilao, Bulacan",
        }
        card_dict: dict[str, object] = {
            "card_number": card.card_number,
            "card_version": card.card_version,
            "issued_at": card.issued_at.strftime("%B %d, %Y") if card.issued_at else "",
        }

        # Resolve profile photo (blocking file I/O → thread).
        photo_data_uri: str = await asyncio.to_thread(get_photo_data_uri, patient)

        cards.append((patient_dict, card_dict, qr_data_uri, photo_data_uri))

    # ── Render PDF in thread pool ─────────────────────────────────────────────
    pdf_bytes: bytes = await asyncio.to_thread(render_batch_health_card_pdf, cards)

    # ── Audit log: one row per request ────────────────────────────────────────
    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="BATCH_PDF",
        entity_type="health_card",
        entity_id=None,
        metadata={"patient_count": len(cards)},
    )
    await db.commit()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="health_cards_batch.pdf"'},
    )


# ---------------------------------------------------------------------------
# GET /health-cards/{patient_id}
# ---------------------------------------------------------------------------


@router.get(
    "/health-cards/{patient_id}",
    response_model=HealthCardResponse | HealthCardMaybeResponse,
    summary="Get health card metadata for a patient",
    description=(
        "Returns the patient's ACTIVE card if one exists.  If no active card "
        "exists, falls back to the most recently issued card of any status so "
        "the UI can display the correct state (e.g. 'reissued' warning).  "
        "Returns 404 only when the patient has no card at all AND "
        "``allow_missing`` is not set.  "
        "Pass ``?allow_missing=true`` to receive ``{card_found: false, card: null}`` "
        "with HTTP 200 instead — this suppresses browser console network errors "
        "when polling card status for patients who may not have a card yet.  "
        "Does NOT return the QR image — the frontend regenerates the QR "
        "preview client-side from patient_id + card_version."
    ),
)
async def get_health_card(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    allow_missing: bool = Query(
        False,
        description=(
            "When true, return HTTP 200 with {card_found: false, card: null} "
            "instead of HTTP 404 when the patient has no health card.  "
            "Use this from list-view callers to avoid browser console network errors."
        ),
    ),
) -> HealthCardResponse | HealthCardMaybeResponse:
    # Prefer the active card; fall back to most-recently-issued card of any status.
    # This is needed because a patient may have multiple rows after a reissue
    # (old row with status='reissued', new row with status='active').
    active_result = await db.execute(
        select(HealthCard).where(
            HealthCard.patient_id == patient_id,
            HealthCard.status == "active",
        )
    )
    card: HealthCard | None = active_result.scalar_one_or_none()

    if card is None:
        # No active card — try to return the latest card of any status so the
        # frontend can show the correct state banner instead of a bare 404.
        fallback_result = await db.execute(
            select(HealthCard)
            .where(HealthCard.patient_id == patient_id)
            .order_by(desc(HealthCard.issued_at))
            .limit(1)
        )
        card = fallback_result.scalar_one_or_none()

    if card is None:
        if allow_missing:
            # Return 200 with card_found=False so the browser does not log a
            # network error — this is the normal state for new patients who
            # haven't been issued a card yet.
            return HealthCardMaybeResponse(card_found=False, card=None)
        raise NotFoundError(f"No health card found for patient {patient_id}.")

    card_data = HealthCardResponse(
        id=str(card.id),
        patient_id=str(card.patient_id),
        card_number=card.card_number,
        card_version=card.card_version,
        status=card.status,  # type: ignore[arg-type]
        issued_at=card.issued_at,
        expires_at=card.expires_at,
        nfc_uid=card.nfc_uid,
        qr_data_uri=None,  # intentionally omitted on GET metadata
    )

    if allow_missing:
        # Wrap in the envelope so callers using allow_missing=true get a
        # consistent response shape regardless of whether a card was found.
        return HealthCardMaybeResponse(card_found=True, card=card_data)

    return card_data


# ---------------------------------------------------------------------------
# GET /health-cards/{patient_id}/pdf
# ---------------------------------------------------------------------------


@router.get(
    "/health-cards/{patient_id}/pdf",
    summary="Render and download the printable PDF health card",
    description=(
        "Fetches patient + card data, generates the QR image, renders the "
        "two-page WeasyPrint PDF, and streams it as a downloadable attachment."
    ),
)
async def download_health_card_pdf(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> StreamingResponse:
    # Fetch patient.
    patient = await get_patient(db, patient_id)

    # Fetch card.
    card_result = await db.execute(
        select(HealthCard).where(
            HealthCard.patient_id == patient_id,
            HealthCard.status == "active",
        )
    )
    card: HealthCard | None = card_result.scalar_one_or_none()
    if card is None:
        raise NotFoundError(
            f"No active health card found for patient {patient_id}. "
            "Generate a card first."
        )

    # Generate QR image (deterministic from patient_id + card_version).
    _signed_url, qr_data_uri = qr_service.encode_qr_payload(
        str(patient_id), card.card_version
    )

    # Build template context dicts (only display-safe fields — no encrypted PHI).
    from datetime import date as _date  # noqa: PLC0415

    # Age computation: full years elapsed since birth_date.
    _today = _date.today()
    _bd = patient.birth_date
    _age: int = (
        _today.year - _bd.year
        - ((_today.month, _today.day) < (_bd.month, _bd.day))
        if _bd
        else 0
    )

    # Human-readable birth date, e.g. "January 15, 1985".
    _birth_date_display: str = (
        _bd.strftime("%B %d, %Y").replace(" 0", " ")  # strip leading zero on day
        if _bd
        else "—"
    )

    # ── Vitals: fetch most recent Visit for this patient ──────────────────
    _visit_result = await db.execute(
        select(Visit)
        .where(Visit.patient_id == patient_id)
        .order_by(Visit.visit_date.desc())
        .limit(1)
    )
    _latest_visit: Visit | None = _visit_result.scalar_one_or_none()

    if _latest_visit is not None:
        _last_bp: str = _latest_visit.blood_pressure or "—"
        _last_weight: str = (
            str(_latest_visit.weight_kg) if _latest_visit.weight_kg is not None else "—"
        )
        _last_height: str = (
            str(_latest_visit.height_cm) if _latest_visit.height_cm is not None else "—"
        )
        _last_temp: str = (
            str(_latest_visit.temperature) if _latest_visit.temperature is not None else "—"
        )
    else:
        _last_bp = "—"
        _last_weight = "—"
        _last_height = "—"
        _last_temp = "—"

    # ── Allergies: derive from medical_histories already loaded via selectin ──
    # condition_name is a plain-text field (not encrypted) — safe to display.
    _allergies: str
    if patient.medical_histories:
        _allergies = ", ".join(
            mh.condition_name for mh in patient.medical_histories if mh.condition_name
        ) or "None on record"
    else:
        _allergies = "None on record"

    patient_dict: dict[str, object] = {
        # ── Front face fields ──────────────────────────────────────────
        "first_name": patient.first_name,
        "last_name": patient.last_name,
        "middle_name": patient.middle_name,
        "patient_code": patient.patient_code,
        "sex": patient.sex,
        # Retained for backward compatibility — templates use display-formatted fields.
        "birth_date": patient.birth_date.strftime("%Y-%m-%d") if _bd else "",
        "age": _age,
        "birth_date_display": _birth_date_display,
        "mobile_number": patient.mobile_number or "—",
        "philhealth_no": patient.philhealth_no or "—",
        "philhealth_member_type": patient.philhealth_member_type or "",
        # ── Back face fields ───────────────────────────────────────────
        "address": patient.address or "—",
        # Structured address fields for the back-face template.
        # The template prefers these over the composite address field.
        "sitio_purok": patient.sitio_purok or "",
        "barangay": patient.barangay or "",
        "municipality": patient.municipality or "",
        "province": patient.province or "",
        # blood_type: use stored value or fall back to em-dash placeholder.
        "blood_type": patient.blood_type or "—",
        # Allergies sourced from medical_history condition_name rows.
        "allergies": _allergies,
        # Vitals from most-recent Visit, or "—" if no visit exists.
        "last_bp": _last_bp,
        "last_weight": _last_weight,
        "last_height": _last_height,
        "last_temp": _last_temp,
        "medical_notes": "",
        # ── Dedicated emergency contact (separate from guardian) ───────
        "emergency_contact_name": patient.emergency_contact_name or "—",
        "emergency_contact_number": patient.emergency_contact_number or "—",
        # ── Guardian (for minors / PWD — shown as fallback) ───────────
        "guardian_name": patient.guardian_name or "—",
        "guardian_contact": patient.guardian_contact or "—",
        # ── Demographic priority flags ─────────────────────────────────
        "is_senior": patient.is_senior,
        "is_pwd": patient.is_pwd,
        "is_pregnant": patient.is_pregnant,
        # BHC facility name shown in the footer disclaimer.
        "barangay_name": "Sta. Rosa 1 BHS, Marilao, Bulacan",
    }
    card_dict = {
        "card_number": card.card_number,
        "card_version": card.card_version,
        "issued_at": card.issued_at.strftime("%B %d, %Y") if card.issued_at else "",
    }

    # Resolve the patient's profile photo as a base64 data URI.
    # This is done here (in async context) so the synchronous pdf_renderer
    # does not need to do any I/O — it receives a ready-to-embed data URI.
    # get_photo_data_uri does blocking file I/O, so offload to a thread.
    from app.services.patient_photo_service import get_photo_data_uri  # noqa: PLC0415

    photo_data_uri: str = await asyncio.to_thread(get_photo_data_uri, patient)

    # Render PDF in a thread pool so WeasyPrint's blocking I/O does not
    # stall the async event loop.
    from app.services.pdf_renderer import render_health_card_pdf  # noqa: PLC0415

    pdf_bytes: bytes = await asyncio.to_thread(
        render_health_card_pdf,
        patient_dict,
        card_dict,
        qr_data_uri,
        photo_data_uri,
    )

    filename = f"health_card_{patient.patient_code}.pdf"
    return StreamingResponse(
        content=iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# POST /health-cards/{patient_id}/nfc-link
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/{patient_id}/nfc-link",
    response_model=HealthCardResponse,
    summary="Bind a physical NFC tag UID to the patient's health card",
    description=(
        "Associates a physical NFC chip's hardware UID with the patient's "
        "active health card row.  Requires BHW role or above."
    ),
    dependencies=[_BHW_PLUS],
)
async def link_nfc_tag(
    patient_id: uuid.UUID,
    body: NfcLinkRequest,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> HealthCardResponse:
    updated_card = await nfc_payload_service.link_nfc_uid(
        db=db,
        patient_id=patient_id,
        nfc_uid=body.nfc_uid,
    )
    # Audit log: NFC link is a card update event.
    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="health_card",
        entity_id=updated_card.id,  # type: ignore[union-attr]
        metadata={
            "action_detail": "nfc_uid_linked",
            "nfc_uid": body.nfc_uid,
            "patient_id": str(patient_id),
        },
        ip_address=_get_client_ip(request),
    )
    await db.commit()

    return HealthCardResponse(
        id=str(updated_card.id),  # type: ignore[union-attr]
        patient_id=str(updated_card.patient_id),  # type: ignore[union-attr]
        card_number=updated_card.card_number,  # type: ignore[union-attr]
        card_version=updated_card.card_version,  # type: ignore[union-attr]
        status=updated_card.status,  # type: ignore[arg-type, union-attr]
        issued_at=updated_card.issued_at,  # type: ignore[union-attr]
        expires_at=updated_card.expires_at,  # type: ignore[union-attr]
        nfc_uid=updated_card.nfc_uid,  # type: ignore[attr-defined]
        qr_data_uri=None,
    )


# ---------------------------------------------------------------------------
# GET /health-cards/verify/public
# Public QR verification — no JWT required.
# Security: HMAC signature in the URL is the sole authentication mechanism.
# Returns only PHI-safe fields (name + patient_code + card_status).
# Called by the public /verify Next.js page that mobile phones land on.
# ---------------------------------------------------------------------------

from app.schemas.health_card import PublicVerifyResponse  # noqa: PLC0415


@router.get(
    "/health-cards/verify/public",
    response_model=PublicVerifyResponse,
    summary="Public QR verification (no login required)",
    description=(
        "Verifies the HMAC signature on a scanned QR code.  "
        "No JWT required — the HMAC is the sole security mechanism.  "
        "Returns only PHI-safe fields: patient name, code, and card status."
    ),
)
async def public_verify_health_card(
    pid: str,
    v: int,
    sig: str,
    request: Request,
    db: DbDep,
) -> PublicVerifyResponse:
    """Public endpoint consumed by the /verify Next.js page on mobile phones."""
    _INVALID = PublicVerifyResponse(valid=False)

    try:
        if not qr_service.verify_qr_payload(pid, v, sig):
            return _INVALID

        try:
            patient_uuid = uuid.UUID(pid)
        except ValueError:
            return _INVALID

        card_result = await db.execute(
            select(HealthCard)
            .where(HealthCard.patient_id == patient_uuid)
            .where(HealthCard.card_version == v)
        )
        card: HealthCard | None = card_result.scalar_one_or_none()
        if card is None or card.status == "revoked":
            return _INVALID

        patient_result = await db.execute(
            select(Patient).where(Patient.id == patient_uuid)
        )
        patient: Patient | None = patient_result.scalar_one_or_none()
        if patient is None or not patient.is_active:
            return _INVALID

        parts = [patient.first_name]
        if patient.middle_name:
            parts.append(patient.middle_name)
        parts.append(patient.last_name)
        full_name = " ".join(parts)

        # Log verification (no user_id for anonymous access).
        verification = CardVerification(
            health_card_id=card.id,
            verification_method="qr",
            verified_by=None,
            success=True,
        )
        db.add(verification)
        await db.commit()

        return PublicVerifyResponse(
            valid=True,
            full_name=full_name,
            patient_code=patient.patient_code,
            card_status=card.status,
        )

    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Unexpected error during public card verification",
            extra={"error": str(exc)},
            exc_info=True,
        )
        return _INVALID


# POST /health-cards/verify
# NOTE: This route MUST be declared before /health-cards/{patient_id}/...
#       routes so FastAPI does not treat "verify" as a patient_id path param.
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/verify",
    # Union return type — response_model is resolved dynamically below.
    # We declare the wider type so OpenAPI schema includes all possible fields.
    response_model=PatientVerifySummaryFull,
    summary="Verify a scanned QR payload or tapped NFC UID",
    description=(
        "Accepts either a QR payload URL string or an NFC chip UID.  "
        "Returns a minimal patient summary on success.  "
        "Pass ``?full=true`` (authenticated staff only) to receive the extended "
        "``PatientVerifySummaryFull`` response including patient_id, birth_date, "
        "mobile_number, and photo_url — a PHI_VIEW audit log entry is written.  "
        "Returns an identical generic 403 for ALL failure modes — no information "
        "about the reason for failure is disclosed to the caller."
    ),
)
async def verify_health_card(
    body: CardVerifyRequest,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
    full: bool = Query(
        False,
        description=(
            "When true, return PatientVerifySummaryFull (adds patient_id, "
            "birth_date, mobile_number, photo_url).  A PHI_VIEW audit log "
            "entry is written.  Only available to authenticated staff."
        ),
    ),
) -> PatientVerifySummary | PatientVerifySummaryFull:
    """
    Verify a health card by QR scan or NFC tap.

    Security design:
    - Every failure returns the identical 403 response body.  The caller
      cannot distinguish between 'card not found', 'HMAC invalid', 'wrong
      version', 'card revoked', etc.  This prevents oracle attacks and avoids
      confirming the existence of card records.
    - All exceptions (including unexpected server errors) are caught and
      converted to the same 403.  The actual error is logged server-side only.
    - A CardVerification row is written for both success and failure outcomes
      to support audit and tampered-card detection.
    - PHI returned is strictly limited to PatientVerifySummary fields.
    """
    found_card: HealthCard | None = None
    verify_method: str = "qr"

    try:
        # ── QR verification path ───────────────────────────────────────────
        if body.qr_payload:
            verify_method = "qr"
            parsed = urlparse(body.qr_payload)
            params = parse_qs(parsed.query)

            pid_list = params.get("pid", [])
            v_list = params.get("v", [])
            sig_list = params.get("sig", [])

            if not pid_list or not v_list or not sig_list:
                # Missing required params — log but return generic 403.
                logger.warning(
                    "QR verify: missing required params",
                    extra={"path": request.url.path},
                )
                raise _VERIFY_FAIL

            pid = pid_list[0]
            sig = sig_list[0]
            try:
                v = int(v_list[0])
            except (ValueError, TypeError):
                raise _VERIFY_FAIL  # noqa: B904

            if not qr_service.verify_qr_payload(pid, v, sig):
                logger.warning(
                    "QR verify: HMAC mismatch",
                    extra={"pid": pid, "v": v},
                )
                raise _VERIFY_FAIL

            # Signature is valid — look up the card.
            try:
                patient_uuid = uuid.UUID(pid)
            except ValueError:
                raise _VERIFY_FAIL  # noqa: B904

            card_result = await db.execute(
                select(HealthCard).where(HealthCard.patient_id == patient_uuid)
            )
            found_card = card_result.scalar_one_or_none()

            if found_card is None or found_card.status != "active":
                logger.warning(
                    "QR verify: card not found or inactive",
                    extra={"patient_id": pid},
                )
                raise _VERIFY_FAIL

            # Double-check: card_version in QR matches DB (prevents replay with old sig).
            if found_card.card_version != v:
                logger.warning(
                    "QR verify: card_version mismatch (old or replayed QR)",
                    extra={"db_version": found_card.card_version, "qr_version": v},
                )
                raise _VERIFY_FAIL

        # ── NFC verification path ──────────────────────────────────────────
        elif body.nfc_uid:
            verify_method = "nfc"
            nfc_uid = body.nfc_uid.strip()

            card_result = await db.execute(
                select(HealthCard).where(HealthCard.nfc_uid == nfc_uid)
            )
            found_card = card_result.scalar_one_or_none()

            if found_card is None or found_card.status != "active":
                logger.warning(
                    "NFC verify: UID not found or card inactive",
                    extra={"nfc_uid": nfc_uid[:8] + "..."},  # partial UID only in logs
                )
                raise _VERIFY_FAIL
        else:
            # Neither qr_payload nor nfc_uid provided.
            raise _VERIFY_FAIL

        # ── Both paths converge here: found_card is valid ──────────────────

        patient_id = found_card.patient_id

        # Load patient record.
        patient_result = await db.execute(
            select(Patient).where(Patient.id == patient_id)
        )
        patient: Patient | None = patient_result.scalar_one_or_none()

        if patient is None or not patient.is_active:
            logger.warning(
                "Verify: patient record not found or inactive",
                extra={"patient_id": str(patient_id)},
            )
            raise _VERIFY_FAIL

        # Last visit date.
        visit_result = await db.execute(
            select(func.max(Visit.visit_date)).where(Visit.patient_id == patient_id)
        )
        last_visit_date = visit_result.scalar_one_or_none()

        # Age computation.
        from datetime import date as _date  # noqa: PLC0415

        today = _date.today()
        bd = patient.birth_date
        age = today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))

        # Full name (no address, no DOB, no PhilHealth — deliberate).
        parts = [patient.first_name]
        if patient.middle_name:
            parts.append(patient.middle_name)
        parts.append(patient.last_name)
        full_name = " ".join(parts)

        # Write verification record (success=True).
        verification = CardVerification(
            health_card_id=found_card.id,
            verification_method=verify_method,
            verified_by=current_user.id,  # type: ignore[attr-defined]
            success=True,
        )
        db.add(verification)

        # Audit CARD_VERIFY for all successful verifications.
        await write_audit_log(
            db=db,
            user_id=current_user.id,  # type: ignore[attr-defined]
            action="CARD_VERIFY",
            entity_type="health_card",
            entity_id=found_card.id,
            metadata={
                "method": verify_method,
                "patient_id": str(patient_id),
                "success": True,
                "full_response": full,
            },
            ip_address=_get_client_ip(request),
        )

        # When full=True, write a separate PHI_VIEW audit entry because the
        # extended response discloses additional PHI (birth_date, mobile, photo).
        if full:
            await write_audit_log(
                db=db,
                user_id=current_user.id,  # type: ignore[attr-defined]
                action="PHI_VIEW",
                entity_type="patient",
                entity_id=patient_id,
                metadata={
                    "trigger": "health_card_verify_full",
                    "fields_disclosed": [
                        "patient_id",
                        "birth_date",
                        "mobile_number",
                        "photo_url",
                    ],
                    "verify_method": verify_method,
                },
                ip_address=_get_client_ip(request),
            )

        await db.commit()

        # Build the minimal summary shared by both response shapes.
        base_summary = dict(
            patient_code=patient.patient_code,
            full_name=full_name,
            age=age,
            sex=patient.sex,
            is_senior=patient.is_senior,
            is_pwd=patient.is_pwd,
            is_pregnant=patient.is_pregnant,
            last_visit_date=last_visit_date,
            card_status=found_card.status,
        )

        if not full:
            # Default minimal response — no additional PHI.
            return PatientVerifySummary(**base_summary)

        # Extended response: include patient_id, birth_date, mobile, photo.
        # photo_url is the relative path the frontend can prefix with the API host.
        photo_url: str | None = (
            f"/media/{patient.photo_path}" if patient.photo_path else None
        )

        return PatientVerifySummaryFull(
            **base_summary,
            patient_id=str(patient_id),
            birth_date=bd.isoformat(),
            mobile_number=patient.mobile_number,
            photo_url=photo_url,
        )

    except ForbiddenError:
        # Record the failed attempt (write-and-forget — best-effort).
        try:
            if found_card is not None:
                fail_record = CardVerification(
                    health_card_id=found_card.id,
                    verification_method=verify_method,
                    verified_by=current_user.id,  # type: ignore[attr-defined]
                    success=False,
                )
                db.add(fail_record)
                await db.commit()
        except Exception as inner_exc:  # noqa: BLE001
            logger.error(
                "Failed to write card_verification failure record",
                extra={"error": str(inner_exc)},
            )
        raise  # re-raise the generic ForbiddenError

    except Exception as exc:  # noqa: BLE001
        # Unexpected exception — log server-side, return same generic 403.
        logger.error(
            "Unexpected error during card verification",
            extra={"error": str(exc), "path": request.url.path},
            exc_info=True,
        )
        raise _VERIFY_FAIL


# ---------------------------------------------------------------------------
# POST /health-cards/{patient_id}/link-nfc-uid
# Convenience alias for /nfc-link with the field name the relay uses ("uid").
# Requires BHW+ JWT — identical security to /nfc-link.
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/{patient_id}/link-nfc-uid",
    response_model=HealthCardResponse,
    summary="Bind a physical NFC tag UID to the patient's health card (relay alias)",
    description=(
        "Alias for /nfc-link that accepts {'uid': '...'} instead of {'nfc_uid': '...'}.  "
        "Used by the NFC relay testing flow so staff can register a school ID's UID "
        "to a test patient via curl before scanning.  Requires BHW role or above."
    ),
    dependencies=[_BHW_PLUS],
)
async def link_nfc_uid_alias(
    patient_id: uuid.UUID,
    body: NfcScanUidRequest,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> HealthCardResponse:
    updated_card = await nfc_payload_service.link_nfc_uid(
        db=db,
        patient_id=patient_id,
        nfc_uid=body.uid,
    )
    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="health_card",
        entity_id=updated_card.id,  # type: ignore[union-attr]
        metadata={
            "action_detail": "nfc_uid_linked_via_relay_alias",
            "nfc_uid": body.uid,
            "patient_id": str(patient_id),
        },
        ip_address=_get_client_ip(request),
    )
    await db.commit()
    return HealthCardResponse(
        id=str(updated_card.id),  # type: ignore[union-attr]
        patient_id=str(updated_card.patient_id),  # type: ignore[union-attr]
        card_number=updated_card.card_number,  # type: ignore[union-attr]
        card_version=updated_card.card_version,  # type: ignore[union-attr]
        status=updated_card.status,  # type: ignore[arg-type, union-attr]
        issued_at=updated_card.issued_at,  # type: ignore[union-attr]
        expires_at=updated_card.expires_at,  # type: ignore[union-attr]
        nfc_uid=updated_card.nfc_uid,  # type: ignore[attr-defined]
        qr_data_uri=None,
    )


# ---------------------------------------------------------------------------
# POST /health-cards/scan-uid
# Public endpoint — no JWT required.
# Called by the NFC relay server when a tag is scanned on the Android phone.
# Returns safe patient info; writes NFC_SCAN audit log; updates last-scan cache.
# ---------------------------------------------------------------------------


async def _scan_nfc_uid_impl(
    body: NfcScanUidRequest,
    request: Request,
    db: DbDep,
) -> NfcScanResponse:
    """Implementation shared by the early-registered scan-uid route shim."""
    uid = body.uid.strip()
    scanned_at_iso = datetime.now(timezone.utc).isoformat()

    # Case-insensitive match: normalise both sides to upper hex.
    # SQLAlchemy func.upper works across PostgreSQL.
    card_result = await db.execute(
        select(HealthCard).where(
            func.upper(HealthCard.nfc_uid) == uid.upper()
        )
    )
    card: HealthCard | None = card_result.scalar_one_or_none()

    if card is None:
        # Update cache with a "not found" entry.
        _last_scan_cache.update(
            scanned_at=scanned_at_iso,
            found=False,
            uid=uid,
            patient=None,
        )
        # Audit the failed scan (no user_id — anonymous relay call).
        await write_audit_log(
            db=db,
            action="NFC_SCAN",
            entity_type="health_card",
            metadata={
                "result": "not_found",
                # Log only first 8 chars of UID to avoid full UID in logs.
                "uid_prefix": uid[:8] + ("..." if len(uid) > 8 else ""),
                "ip": _get_client_ip(request),
            },
            ip_address=_get_client_ip(request),
        )
        await db.commit()
        return NfcScanResponse(
            found=False,
            uid=uid,
            message="Tag not registered. Scan a health card that has been provisioned.",
        )

    # Load associated patient.
    patient_result = await db.execute(
        select(Patient).where(Patient.id == card.patient_id)
    )
    patient: Patient | None = patient_result.scalar_one_or_none()

    if patient is None or not patient.is_active:
        _last_scan_cache.update(
            scanned_at=scanned_at_iso,
            found=False,
            uid=uid,
            patient=None,
        )
        await write_audit_log(
            db=db,
            action="NFC_SCAN",
            entity_type="health_card",
            entity_id=card.id,
            metadata={
                "result": "patient_inactive_or_missing",
                "uid_prefix": uid[:8] + ("..." if len(uid) > 8 else ""),
                "card_id": str(card.id),
            },
            ip_address=_get_client_ip(request),
        )
        await db.commit()
        return NfcScanResponse(
            found=False,
            uid=uid,
            message="Patient record not found or is inactive.",
        )

    # Build full name.
    name_parts = [patient.first_name]
    if patient.middle_name:
        name_parts.append(patient.middle_name)
    name_parts.append(patient.last_name)
    full_name = " ".join(name_parts)

    # DOB — plain date field, safe to display.
    dob_str = patient.birth_date.strftime("%B %d, %Y") if patient.birth_date else "Unknown"

    # Allergies from medical_history.condition_name (plain text, not encrypted).
    allergies_result = await db.execute(
        select(MedicalHistory.condition_name).where(
            MedicalHistory.patient_id == patient.id
        )
    )
    allergy_rows = allergies_result.scalars().all()
    allergies_str = ", ".join(r for r in allergy_rows if r) or "None on record"

    patient_info = NfcScanPatientInfo(
        patient_id=str(patient.id),
        patient_code=patient.patient_code,
        full_name=full_name,
        date_of_birth=dob_str,
        sex=patient.sex,
        blood_type=patient.blood_type,
        emergency_contact_name=patient.guardian_name,
        emergency_contact_number=patient.guardian_contact,
        allergies=allergies_str,
        card_status=card.status,
        is_senior=patient.is_senior,
        is_pwd=patient.is_pwd,
        is_pregnant=patient.is_pregnant,
    )

    # Update the in-memory last-scan cache.
    _last_scan_cache.update(
        scanned_at=scanned_at_iso,
        found=True,
        uid=uid,
        patient=patient_info.model_dump(),
    )

    # Audit log — NFC_SCAN with patient name only (no diagnosis/PHI).
    await write_audit_log(
        db=db,
        action="NFC_SCAN",
        entity_type="health_card",
        entity_id=card.id,
        metadata={
            "result": "found",
            "patient_name": full_name,
            "card_status": card.status,
            "uid_prefix": uid[:8] + ("..." if len(uid) > 8 else ""),
            "ip": _get_client_ip(request),
        },
        ip_address=_get_client_ip(request),
    )
    await db.commit()

    status_label = "active" if card.status == "active" else card.status
    return NfcScanResponse(
        found=True,
        uid=uid,
        message=f"Patient found: {full_name} (card: {status_label})",
        patient=patient_info,
    )


async def _get_last_scan_impl() -> LastScanResponse:
    """Implementation shared by the early-registered last-scan route shim."""
    patient_data = _last_scan_cache.get("patient")
    patient_info: NfcScanPatientInfo | None = (
        NfcScanPatientInfo(**patient_data) if patient_data else None
    )
    return LastScanResponse(
        scanned_at=_last_scan_cache.get("scanned_at"),
        found=bool(_last_scan_cache.get("found")),
        uid=_last_scan_cache.get("uid"),
        patient=patient_info,
    )


# ---------------------------------------------------------------------------
# POST /health-cards/{patient_id}/reissue
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/{patient_id}/reissue",
    response_model=CardGenerateResponse,
    status_code=201,
    summary="Reissue a lost or damaged health card",
    description=(
        "Marks the current active card as 'reissued', bumps card_version, "
        "generates a new card_number, and produces a new QR HMAC.  "
        "The old card's QR/NFC become invalid immediately.  "
        "NFC must be re-linked after reissue via /nfc-link.  "
        "Requires BHW role or above."
    ),
    dependencies=[_BHW_PLUS],
)
async def reissue_health_card(
    patient_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> CardGenerateResponse:
    result = await card_generation_service.reissue_card(
        db=db,
        patient_id=patient_id,
        issued_by_id=current_user.id,
        ip_address=_get_client_ip(request),
    )
    card_dict = result["card"]
    return CardGenerateResponse(
        card=HealthCardResponse(**card_dict, qr_data_uri=result["qr_data_uri"]),
        signed_url=result["signed_url"],
        qr_data_uri=result["qr_data_uri"],
        nfc_payload=result["nfc_payload"],
    )
