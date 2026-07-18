"""
SMS-related endpoints (Phase 4 stubs).

Public route (webhook, validated by Semaphore request signature):
  POST /sms/webhook/delivery-status  — Semaphore delivery status callback

Protected routes:
  GET  /sms/logs        — paginated SMS dispatch log with status filters
  POST /sms/send-manual — send an ad-hoc SMS to a patient (BHW+)

RELIABILITY NOTE (SDP Section 1.5): SMS delivery failures must never block
core clinical workflows.  The webhook handler is best-effort and should
always return HTTP 200 to Semaphore to prevent retries from flooding the log.

SDP Reference: Section 6.8, Section 9
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/sms", tags=["sms"])


@router.get("/logs", summary="List SMS dispatch log (Admin / BHW)")
async def list_sms_logs() -> dict[str, str]:
    """
    Returns paginated SMS log entries with status (queued, sent, delivered,
    failed) and associated patient/appointment references.

    Supports query params: patient_id, status, date_from, date_to, page, page_size.

    Auth: Admin, BHW.
    Full implementation: Phase 4 — Appointments & SMS.
    """
    return {"message": "TODO: Phase 4 — list SMS logs"}


@router.post("/send-manual", summary="Send an ad-hoc SMS to a patient", status_code=202)
async def send_manual_sms() -> dict[str, str]:
    """
    Enqueues an ad-hoc SMS (e.g. BHC announcement, custom reminder) to a
    patient's registered mobile number via the Celery SMS task.

    Returns HTTP 202 Accepted immediately; delivery is asynchronous.
    The created sms_logs record ID is returned so the caller can poll status.

    Auth: BHW, Physician, Admin Staff, Admin.
    Full implementation: Phase 4 — Appointments & SMS.
    """
    return {"message": "TODO: Phase 4 — send manual SMS"}


@router.post(
    "/webhook/delivery-status",
    summary="Semaphore delivery status callback (public, signed webhook)",
)
async def sms_delivery_status_webhook() -> dict[str, str]:
    """
    Receives delivery status updates from Semaphore and updates the matching
    sms_logs row (status → 'delivered' or 'failed', provider_message_id).

    The request signature (Semaphore shared secret) is validated before
    processing.  Always returns HTTP 200 to prevent Semaphore retries.

    Auth: Public (webhook — validated by HMAC signature, not JWT).
    Full implementation: Phase 4 — Appointments & SMS.
    """
    return {"message": "TODO: Phase 4 — Semaphore delivery status webhook"}
