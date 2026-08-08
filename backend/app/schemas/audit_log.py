"""
Pydantic v2 schemas for audit log query responses.

SDP Reference: Section 6.9 — Users & Audit API
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogEntry(BaseModel):
    """
    A single audit log entry as returned by GET /audit-logs.

    Note: ``metadata`` maps from the ORM field ``AuditLog.metadata_``
    (the Python attribute has a trailing underscore to avoid shadowing the
    built-in, but the DB column is named "metadata").

    ``user_email`` is populated via a LEFT JOIN on the users table at query
    time — it is not derived from the ORM relationship (which is lazy="noload").
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None
    user_email: str | None  # joined from users table at query time
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    metadata: dict  # maps from AuditLog.metadata_ ORM attribute
    ip_address: str | None
    created_at: datetime


class PaginatedAuditLogs(BaseModel):
    """Paginated response for GET /audit-logs."""

    items: list[AuditLogEntry]
    total: int
    page: int
    page_size: int
