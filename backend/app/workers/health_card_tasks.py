"""
Celery tasks for async health card PDF generation.

Task:
  generate_health_card_pdf_task(patient_id: str, card_id: str)
    Renders the WeasyPrint PDF for a health card and updates
    health_cards.generation_status and health_cards.pdf_url.

    Status transitions:
      pending  → (task starts)  → rendering → ready | failed

    The PDF is saved to backend/media/health_cards/<card_id>.pdf.
    pdf_url is stored as the relative path "health_cards/<card_id>.pdf"
    so it is environment-agnostic (the API host prefix is added by the caller).

Security note:
  Task arguments contain ONLY UUIDs — no PHI is placed in Celery task args.
  The rendered PDF bytes are written to disk; only the relative path is
  stored in the DB.  pdf_url is a file path, not a signed URL, and does
  not itself constitute PHI.

Pattern mirrors registration_tasks.py:
  - CelerySessionLocal for a fresh async session per task invocation.
  - asyncio.run() via _run_async() for the event-loop-per-task model.
  - Late-ack (acks_late=True) so a worker crash re-queues the task.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import date as _date
from typing import Any

from celery import Task

from app.core.logging import get_logger
from app.workers.celery_app import celery_app

logger = get_logger(__name__)

# Directory (relative to the backend package root) where generated PDFs are saved.
# Mirrors the media path used by patient_photo_service.
_PDF_OUTPUT_DIR = os.path.join(
    os.path.dirname(__file__),  # backend/app/workers/
    "..",  # backend/app/
    "..",  # backend/
    "media",
    "health_cards",
)


def _run_async(coro: Any) -> Any:  # type: ignore[misc]
    """Run a coroutine synchronously — standard Celery task wrapper."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Async implementation
# ---------------------------------------------------------------------------


async def _generate_health_card_pdf_async(
    patient_id: str,
    card_id: str,
) -> dict[str, str]:
    """
    Full PDF-generation pipeline, async, using a CelerySessionLocal session.

    Steps:
    1. Fetch the HealthCard row by card_id; fail fast if not found.
    2. Set generation_status = "pending" and commit so the API status endpoint
       reflects the in-progress state (the endpoint already set this, but this
       makes the task idempotent on retry).
    3. Fetch the associated Patient with medical_histories loaded.
    4. Fetch the most-recent Visit for vitals.
    5. Generate QR data URI (deterministic — patient_id + card_version + HMAC).
    6. Resolve the profile photo as a base64 data URI.
    7. Render the PDF with render_health_card_pdf() (blocking — must be called
       via asyncio.to_thread so it does not block the event loop).
    8. Write the PDF bytes to disk at media/health_cards/<card_id>.pdf.
    9. Update generation_status = "ready", pdf_url = relative path, commit.
    10. Return {"status": "ready", "pdf_url": <relative_path>}.

    On any exception:
      - Set generation_status = "failed", commit.
      - Re-raise so Celery can record the failure and trigger a retry.
    """
    from sqlalchemy import select  # noqa: PLC0415

    from app.models.health_card import HealthCard  # noqa: PLC0415
    from app.models.medical_history import MedicalHistory  # noqa: PLC0415
    from app.models.patient import Patient  # noqa: PLC0415
    from app.models.visit import Visit  # noqa: PLC0415
    from app.services import qr_service  # noqa: PLC0415
    from app.services.patient_photo_service import get_photo_data_uri  # noqa: PLC0415
    from app.services.pdf_renderer import render_health_card_pdf  # noqa: PLC0415
    from app.workers.db import CelerySessionLocal  # noqa: PLC0415

    card_uuid = uuid.UUID(card_id)
    patient_uuid = uuid.UUID(patient_id)

    async with CelerySessionLocal() as db:
        # ── 1. Fetch HealthCard ───────────────────────────────────────────────
        card_result = await db.execute(select(HealthCard).where(HealthCard.id == card_uuid))
        card: HealthCard | None = card_result.scalar_one_or_none()
        if card is None:
            raise ValueError(f"HealthCard {card_id} not found")

        # ── 2. Mark as pending (idempotent on retry) ──────────────────────────
        card.generation_status = "pending"
        await db.commit()

        try:
            # ── 3. Fetch Patient with medical_histories ───────────────────────
            patient_result = await db.execute(select(Patient).where(Patient.id == patient_uuid))
            patient: Patient | None = patient_result.scalar_one_or_none()
            if patient is None:
                raise ValueError(f"Patient {patient_id} not found")

            # Fetch medical history (condition_name only — plain text, not encrypted).
            mh_result = await db.execute(
                select(MedicalHistory.condition_name).where(
                    MedicalHistory.patient_id == patient_uuid
                )
            )
            mh_rows = mh_result.scalars().all()
            allergies_str = ", ".join(r for r in mh_rows if r) or "None on record"

            # ── 4. Most-recent Visit for vitals ───────────────────────────────
            visit_result = await db.execute(
                select(Visit)
                .where(Visit.patient_id == patient_uuid)
                .order_by(Visit.visit_date.desc())
                .limit(1)
            )
            latest_visit: Visit | None = visit_result.scalar_one_or_none()

            if latest_visit is not None:
                last_bp: str = latest_visit.blood_pressure or "—"
                last_weight: str = (
                    f"{latest_visit.weight_kg} kg" if latest_visit.weight_kg is not None else "—"
                )
                last_height: str = (
                    f"{latest_visit.height_cm} cm" if latest_visit.height_cm is not None else "—"
                )
                last_temp: str = (
                    f"{latest_visit.temperature}°C" if latest_visit.temperature is not None else "—"
                )
                last_visit_date: str = (
                    latest_visit.visit_date.strftime("%B %d, %Y")
                    if latest_visit.visit_date
                    else "—"
                )
            else:
                last_bp = last_weight = last_height = last_temp = "—"
                last_visit_date = "—"

            # ── 5. QR data URI (deterministic) ────────────────────────────────
            _signed_url, qr_data_uri = qr_service.encode_qr_payload(
                str(patient_uuid), card.card_version
            )

            # ── 6. Age and birth date display ─────────────────────────────────
            today = _date.today()
            bd = patient.birth_date
            age: int = (
                today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day)) if bd else 0
            )
            birth_date_display: str = bd.strftime("%B %d, %Y").replace(" 0", " ") if bd else "—"

            patient_dict: dict[str, object] = {
                "first_name": patient.first_name,
                "last_name": patient.last_name,
                "middle_name": patient.middle_name,
                "patient_code": patient.patient_code,
                "sex": patient.sex,
                "birth_date": patient.birth_date.strftime("%Y-%m-%d") if bd else "",
                "age": age,
                "birth_date_display": birth_date_display,
                "mobile_number": patient.mobile_number or "—",
                "philhealth_no": patient.philhealth_no or "—",
                "philhealth_member_type": patient.philhealth_member_type or "",
                "address": patient.address or "—",
                "sitio_purok": patient.sitio_purok or "",
                "barangay": patient.barangay or "",
                "municipality": patient.municipality or "",
                "province": patient.province or "",
                "blood_type": patient.blood_type or "—",
                "allergies": allergies_str,
                "last_bp": last_bp,
                "last_weight": last_weight,
                "last_height": last_height,
                "last_temp": last_temp,
                "last_visit_date": last_visit_date,
                "medical_notes": "",
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

            # ── 6. Profile photo data URI (blocking I/O → thread) ─────────────
            photo_data_uri: str = await asyncio.to_thread(get_photo_data_uri, patient)

            # ── 7. Render PDF (blocking WeasyPrint → thread) ──────────────────
            pdf_bytes: bytes = await asyncio.to_thread(
                render_health_card_pdf,
                patient_dict,
                card_dict,
                qr_data_uri,
                photo_data_uri,
            )

            # ── 8. Write PDF to disk ──────────────────────────────────────────
            os.makedirs(_PDF_OUTPUT_DIR, exist_ok=True)
            pdf_filename = f"{card_id}.pdf"
            pdf_abs_path = os.path.join(_PDF_OUTPUT_DIR, pdf_filename)
            await asyncio.to_thread(_write_bytes, pdf_abs_path, pdf_bytes)

            # Relative path stored in DB — caller prepends API host if needed.
            relative_pdf_url = f"health_cards/{pdf_filename}"

            # ── 9. Update card record ─────────────────────────────────────────
            card.generation_status = "ready"
            card.pdf_url = relative_pdf_url
            await db.commit()

            logger.info(
                "generate_health_card_pdf_task: PDF ready",
                extra={
                    "card_id": card_id,
                    "patient_id": patient_id,
                    "pdf_url": relative_pdf_url,
                },
            )
            return {"status": "ready", "pdf_url": relative_pdf_url}

        except Exception as exc:
            # Mark as failed so the status endpoint can surface the error to the UI.
            try:
                card.generation_status = "failed"
                await db.commit()
            except Exception as inner:  # noqa: BLE001
                logger.error(
                    "generate_health_card_pdf_task: could not mark card as failed",
                    extra={"card_id": card_id, "inner_error": str(inner)},
                )
            logger.error(
                "generate_health_card_pdf_task: PDF generation failed",
                extra={"card_id": card_id, "patient_id": patient_id, "error": str(exc)},
                exc_info=True,
            )
            raise


def _write_bytes(path: str, data: bytes) -> None:
    """Synchronous helper — write bytes to path (called via asyncio.to_thread)."""
    with open(path, "wb") as f:
        f.write(data)


# ---------------------------------------------------------------------------
# Celery task wrapper
# ---------------------------------------------------------------------------


@celery_app.task(
    name="health_cards.generate_pdf",
    bind=True,
    max_retries=2,
    retry_backoff=True,
    acks_late=True,
    task_reject_on_worker_lost=True,
)
def generate_health_card_pdf_task(
    self: Task,
    patient_id: str,
    card_id: str,
) -> dict[str, str]:
    """
    Celery task: generate a health card PDF in the background.

    Arguments contain ONLY UUIDs — no PHI in task args.
    Retries up to 2 times on failure with exponential backoff.
    """
    logger.info(
        "generate_health_card_pdf_task started",
        extra={
            "patient_id": patient_id,
            "card_id": card_id,
            "attempt": self.request.retries + 1,
            "max_retries": self.max_retries,
        },
    )
    return _run_async(_generate_health_card_pdf_async(patient_id, card_id))
