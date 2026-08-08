"""
Audit log query service — read-only access to the audit_logs table.

Distinct from audit_service.py which handles WRITES.  This module handles
paginated, filtered READS for the Admin audit-log viewer.

Uses SQLAlchemy Core (sa.select with explicit columns) rather than ORM
``lazy="noload"`` joins to avoid issues with the AuditLog.user relationship
being noload — the user email is joined directly via SQL rather than ORM.

SDP Reference: Section 6.9 — Users & Audit API
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user import User


async def list_audit_logs(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict[str, Any]], int]:
    """
    Return a paginated list of audit log entries with optional filters.

    Performs a LEFT JOIN against the users table to include the user's email
    address alongside each log entry.  Results are ordered newest-first.

    Args:
        db:          Active async database session.
        user_id:     Filter by the user who performed the action.
        action:      Filter by action string (e.g. "CREATE", "LOGIN").
        entity_type: Filter by entity type (e.g. "patient", "user").
        entity_id:   Filter by the affected entity's UUID.
        date_from:   Include entries on or after this date (inclusive).
        date_to:     Include entries on or before this date (inclusive).
        page:        1-based page number.
        page_size:   Records per page — capped at 100.

    Returns:
        A tuple of (list_of_dicts, total_count).
        Each dict contains all AuditLog columns plus ``user_email`` from users.
    """
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size

    # Build the SELECT using Core for explicit column control.
    # AuditLog.metadata_ maps to DB column "metadata" — reference by ORM attr.
    select_stmt = (
        sa.select(
            AuditLog.id,
            AuditLog.user_id,
            User.email.label("user_email"),
            AuditLog.action,
            AuditLog.entity_type,
            AuditLog.entity_id,
            AuditLog.metadata_.label("metadata"),  # DB col "metadata"
            AuditLog.ip_address,
            AuditLog.created_at,
        )
        .select_from(AuditLog)
        .outerjoin(User, AuditLog.user_id == User.id)
        .order_by(AuditLog.created_at.desc())
    )

    count_stmt = (
        sa.select(sa.func.count())
        .select_from(AuditLog)
    )

    # Apply filters to both statements
    filters: list[Any] = []
    if user_id is not None:
        filters.append(AuditLog.user_id == user_id)
    if action is not None:
        filters.append(AuditLog.action == action)
    if entity_type is not None:
        filters.append(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        filters.append(AuditLog.entity_id == entity_id)
    if date_from is not None:
        filters.append(sa.cast(AuditLog.created_at, sa.Date) >= date_from)
    if date_to is not None:
        filters.append(sa.cast(AuditLog.created_at, sa.Date) <= date_to)

    if filters:
        select_stmt = select_stmt.where(*filters)
        count_stmt = count_stmt.where(*filters)

    # Total count
    total_result = await db.execute(count_stmt)
    total: int = total_result.scalar_one()

    # Paginated rows
    paginated_stmt = select_stmt.offset(offset).limit(page_size)
    rows_result = await db.execute(paginated_stmt)
    rows = rows_result.mappings().all()

    # Convert RowMapping objects to plain dicts
    entries: list[dict[str, Any]] = [dict(row) for row in rows]

    return entries, total
