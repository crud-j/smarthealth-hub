"""
Audit logging service — append-only writes to the ``audit_logs`` table.

This module exposes a single async function ``write_audit_log`` that
constructs and persists an ``AuditLog`` row.  The function never raises —
audit failures are logged to the application logger but must NOT interrupt
the primary clinical workflow.

Standard ``action`` values (extend the AuditLog docstring when you add new ones):
  LOGIN, LOGOUT, LOGIN_FAILED, OTP_SENT, OTP_VERIFIED
  CREATE, UPDATE, DELETE, VIEW_PHI
  CARD_ISSUE, CARD_VERIFY, CARD_REVOKE
  PASSWORD_CHANGED, PASSWORD_RESET_REQUESTED

Usage::

    from app.services.audit_service import write_audit_log

    await write_audit_log(
        db=db,
        user_id=user.id,
        action="LOGIN",
        entity_type="user",
        entity_id=user.id,
        metadata={"ip": "192.168.1.1"},
        ip_address="192.168.1.1",
    )
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger

logger = get_logger(__name__)


async def write_audit_log(
    *,
    db: AsyncSession,
    action: str,
    entity_type: str,
    user_id: uuid.UUID | None = None,
    entity_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """
    Append an entry to the ``audit_logs`` table.

    Intentionally fire-and-forget: any exception during persistence is
    caught, logged, and swallowed so that a transient DB write failure
    cannot block a clinical workflow.

    Args:
        db:          The active ``AsyncSession`` for the current request.
        action:      Standardised action string (e.g. "LOGIN", "UPDATE").
        entity_type: The resource type being acted on (e.g. "user", "patient").
        user_id:     UUID of the user performing the action (None for system actions).
        entity_id:   UUID of the affected resource (None when not applicable).
        metadata:    Optional JSONB dict with contextual details (IP, changed fields, etc.).
        ip_address:  Client IP address extracted from the request.
    """
    # Import inside function to avoid circular imports at module load time.
    from app.models.audit_log import AuditLog

    try:
        log_entry = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_=metadata or {},
            ip_address=ip_address,
        )
        db.add(log_entry)
        await db.flush()  # flush within the current transaction (caller commits)
    except Exception as exc:  # noqa: BLE001
        # Audit failure must never crash the parent request.
        logger.error(
            "Failed to write audit log entry",
            extra={
                "action": action,
                "entity_type": entity_type,
                "user_id": str(user_id) if user_id else None,
                "error": str(exc),
            },
        )
