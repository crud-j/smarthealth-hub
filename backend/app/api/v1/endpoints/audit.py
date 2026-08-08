"""
Audit log endpoints — Admin only (read-only).

Audit logs are append-only.  No CREATE, UPDATE, or DELETE endpoints exist —
the log is immutable by design (enforced at the DB level by rules added in
migration 0008_audit_log_immutable).

Routes:
  GET /audit-logs — paginated, filtered audit trail

Auth: require_role("admin") on all routes.

SDP Reference: Section 6.9 (Audit), Section 5.7 (Security & Audit)
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.security import require_role
from app.db.session import DbDep
from app.models.user import User
from app.schemas.audit_log import AuditLogEntry, PaginatedAuditLogs
from app.services import audit_query_service

router = APIRouter(prefix="/audit-logs", tags=["audit"])

AdminOnly = require_role("admin")


@router.get(
    "",
    response_model=PaginatedAuditLogs,
    summary="View audit trail (Admin only)",
)
async def list_audit_logs(
    current_user: Annotated[User, AdminOnly],
    db: DbDep,
    user_id: uuid.UUID | None = Query(None, description="Filter by acting user UUID"),
    action: str | None = Query(
        None,
        description="Filter by action (CREATE, UPDATE, DELETE, VIEW_PHI, LOGIN, etc.)",
    ),
    entity_type: str | None = Query(
        None,
        description="Filter by entity type (patient, user, health_card, etc.)",
    ),
    entity_id: uuid.UUID | None = Query(
        None, description="Filter by affected entity UUID"
    ),
    date_from: date | None = Query(
        None, description="Include entries on or after this date (YYYY-MM-DD)"
    ),
    date_to: date | None = Query(
        None, description="Include entries on or before this date (YYYY-MM-DD)"
    ),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(
        20, ge=1, le=100, description="Records per page (max 100)"
    ),
) -> PaginatedAuditLogs:
    """
    Returns a paginated, filterable audit trail of all sensitive system actions.

    Entries include: patient record creates/updates/deletes, health card issuances,
    user logins/logouts, role changes, and PHI views.

    The user_email field is populated via a LEFT JOIN on the users table.
    System-generated entries (no acting user) will have user_email=None.

    Auth: Admin only.
    """
    entries, total = await audit_query_service.list_audit_logs(
        db,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )

    return PaginatedAuditLogs(
        items=[AuditLogEntry(**entry) for entry in entries],
        total=total,
        page=page,
        page_size=page_size,
    )
