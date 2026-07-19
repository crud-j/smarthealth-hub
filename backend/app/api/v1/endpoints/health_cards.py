"""
Health card generation, retrieval, and verification endpoints — Phase 3.

Routes use full paths and are mounted without a prefix on the API router.

  POST /health-cards/{patient_id}/generate  — generate card (QR + NFC payload)
  GET  /health-cards/{patient_id}           — get card metadata (no QR image)
  GET  /health-cards/{patient_id}/pdf       — render + stream printable PDF
  POST /health-cards/{patient_id}/nfc-link  — bind physical NFC UID to card
  POST /health-cards/verify                 — verify QR scan or NFC tap
  POST /health-cards/{patient_id}/reissue   — reissue lost/damaged card

Security invariants enforced in this file:
  1. Every route requires JWT authentication.
  2. Mutation routes (generate, nfc-link, reissue) require BHW+ role.
  3. The verify endpoint returns a GENERIC 403 for ALL failure modes —
     no information about WHY verification failed is exposed to the caller.
  4. The verify response contains ONLY PatientVerifySummary fields
     (patient_code, full_name, age, sex, priority flags, last_visit, card_status).
     No address, philhealth_no, diagnosis, or other PHI is returned.
  5. Every card event writes an audit log entry.

SDP Reference: Section 6.6, Section 8
"""

from __future__ import annotations

import asyncio
import uuid
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.logging import get_logger
from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.models.card_verification import CardVerification
from app.models.health_card import HealthCard
from app.models.patient import Patient
from app.models.visit import Visit
from app.schemas.health_card import (
    CardGenerateResponse,
    CardVerifyRequest,
    HealthCardResponse,
    NfcLinkRequest,
    PatientVerifySummary,
)
from app.services import card_generation_service, nfc_payload_service, qr_service
from app.services.audit_service import write_audit_log
from app.services.patient_service import get_patient

logger = get_logger(__name__)

router = APIRouter(tags=["health-cards"])

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
        qr_data_uri=result["qr_data_uri"],
        nfc_payload=result["nfc_payload"],
    )


# ---------------------------------------------------------------------------
# GET /health-cards/{patient_id}
# ---------------------------------------------------------------------------


@router.get(
    "/health-cards/{patient_id}",
    response_model=HealthCardResponse,
    summary="Get health card metadata for a patient",
    description=(
        "Returns card metadata only.  Does NOT return the QR image — "
        "the frontend regenerates QR preview client-side from patient_id + card_version."
    ),
)
async def get_health_card(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> HealthCardResponse:
    result = await db.execute(
        select(HealthCard).where(HealthCard.patient_id == patient_id)
    )
    card: HealthCard | None = result.scalar_one_or_none()
    if card is None:
        raise NotFoundError(f"No health card found for patient {patient_id}.")
    return HealthCardResponse(
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

    patient_dict: dict[str, object] = {
        # ── Front face fields ──────────────────────────────────────────
        "first_name": patient.first_name,
        "last_name": patient.last_name,
        "middle_name": patient.middle_name,
        "patient_code": patient.patient_code,
        "sex": patient.sex,
        # Retained for backward compatibility — templates now use the
        # display-formatted fields below.
        "birth_date": patient.birth_date.strftime("%Y-%m-%d") if _bd else "",
        # New front-face fields:
        "age": _age,
        "birth_date_display": _birth_date_display,
        "mobile_number": patient.mobile_number or "—",
        "philhealth_no": patient.philhealth_no or "—",
        "philhealth_member_type": patient.philhealth_member_type or "",
        # ── Back face fields (safe placeholder defaults) ───────────────
        # address is a required non-null column on Patient.
        "address": patient.address or "—",
        # Clinical snapshot fields — populated by a future visit-data
        # enrichment step; defaults shown until that layer is wired in.
        "blood_type": "—",
        "allergies": "None on record",
        "last_bp": "—",
        "last_weight": "—",
        "last_height": "—",
        "last_temp": "—",
        "medical_notes": "",
        # BHC facility name shown in the footer disclaimer.
        "barangay_name": "Sta. Rosa 1 BHS, Marilao, Bulacan",
    }
    card_dict = {
        "card_number": card.card_number,
        "card_version": card.card_version,
        "issued_at": card.issued_at.strftime("%B %d, %Y") if card.issued_at else "",
    }

    # Render PDF in a thread pool so WeasyPrint's blocking I/O does not
    # stall the async event loop.
    from app.services.pdf_renderer import render_health_card_pdf  # noqa: PLC0415

    pdf_bytes: bytes = await asyncio.to_thread(
        render_health_card_pdf, patient_dict, card_dict, qr_data_uri
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
# POST /health-cards/verify
# NOTE: This route MUST be declared before /health-cards/{patient_id}/...
#       routes so FastAPI does not treat "verify" as a patient_id path param.
# ---------------------------------------------------------------------------


@router.post(
    "/health-cards/verify",
    response_model=PatientVerifySummary,
    summary="Verify a scanned QR payload or tapped NFC UID",
    description=(
        "Accepts either a QR payload URL string or an NFC chip UID.  "
        "Returns a minimal patient summary on success.  Returns an identical "
        "generic 403 for ALL failure modes — no information about the reason "
        "for failure is disclosed to the caller."
    ),
)
async def verify_health_card(
    body: CardVerifyRequest,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> PatientVerifySummary:
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

        # Audit VIEW_PHI.
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
            },
            ip_address=_get_client_ip(request),
        )

        await db.commit()

        # Return strictly limited summary — no PHI beyond what's specified.
        return PatientVerifySummary(
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
        qr_data_uri=result["qr_data_uri"],
        nfc_payload=result["nfc_payload"],
    )
