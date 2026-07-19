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

from pydantic import ConfigDict

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


class ManualSMSSentResponse(BaseSchema):
    """
    202 Accepted response for POST /sms/send-manual.

    Returns the newly created sms_logs row ID so the caller can poll
    GET /sms/logs to observe delivery status.
    """

    sms_log_id: uuid.UUID
    status: str  # always 'queued' at accept time


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
