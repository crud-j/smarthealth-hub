"""
Pydantic v2 schemas for SMS log request/response serialization.

Schemas:
  SMSLogResponse         — Full sms_logs row for list/detail responses.
  PaginatedSMSLogs       — Paginated wrapper for GET /sms/logs.
  ManualSMSRequest       — POST /sms/send-manual request body.
  ManualSMSSentResponse  — 202 response for POST /sms/send-manual.
  DeliveryWebhookPayload — POST /sms/webhook/delivery-status body from Semaphore.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import ConfigDict, Field

from app.schemas._base import BaseSchema


class SMSLogResponse(BaseSchema):
    """
    Full SMS log row returned by GET /sms/logs and referenced in appointment
    detail responses.

    ``sent_at`` is set by the Celery task when Semaphore confirms dispatch.
    ``provider_message_id`` is the Semaphore message ID used to correlate
    delivery-status webhook callbacks.
    ``error_detail`` captures the raw Semaphore error body on failure (no PHI).
    """

    id: uuid.UUID
    patient_id: uuid.UUID | None
    appointment_id: uuid.UUID | None
    immunization_id: uuid.UUID | None
    mobile_number: str
    message: str
    status: str  # 'queued' | 'sent' | 'delivered' | 'failed'
    provider_message_id: str | None
    error_detail: str | None
    sent_at: datetime | None
    created_at: datetime


class PaginatedSMSLogs(BaseSchema):
    """Paginated list response for GET /sms/logs."""

    items: list[SMSLogResponse]
    total: int
    page: int
    page_size: int


class ManualSMSRequest(BaseSchema):
    """
    Request body for POST /sms/send-manual.

    The service looks up the patient's mobile_number from the DB; the caller
    only provides the patient UUID and the message text.
    """

    patient_id: uuid.UUID
    message: str
    send_now: bool = Field(
        default=False,
        description=(
            "False (default): queue via Celery — fast response, actual "
            "delivery depends on a worker being up and processing the "
            "queue. True: send synchronously within this request — the "
            "response waits for the real Semaphore result instead of just "
            "confirming the row was queued."
        ),
    )


class ManualSMSSentResponse(BaseSchema):
    """
    Response for POST /sms/send-manual.

    ``status`` reflects the real outcome for ``send_now=True`` requests
    ('sent' or 'failed'), or the initial 'queued' state for the default
    fire-and-forget path.
    """

    sms_log_id: uuid.UUID
    status: str  # 'queued' | 'sent' | 'failed'
    error_detail: str | None = None


class DeliveryWebhookPayload(BaseSchema):
    """
    Delivery-status callback body from Semaphore.

    Semaphore posts this to POST /sms/webhook/delivery-status when a
    previously dispatched message is delivered or fails.

    ``extra="allow"`` lets Semaphore include additional metadata fields
    (e.g. network, timestamp) without causing a validation error — we
    only parse the fields we need.

    Known Semaphore delivery status strings include:
      "Sent", "Delivered", "Failed", "Undelivered", "Expired"
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,
        extra="allow",
    )

    message_id: str
    status: str
