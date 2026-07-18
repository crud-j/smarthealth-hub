"""
Audit log endpoints (Phase 6 stubs — Admin only).

Audit logs are append-only.  No DELETE or PATCH endpoints exist for this
resource — the log is immutable by design to preserve the integrity of the
compliance trail.

  GET /audit-logs  — paginated audit trail with filters

SDP Reference: Section 6.9 (Audit), Section 5.7 (Security & Audit)
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("", summary="View audit trail (Admin only)")
async def list_audit_logs() -> dict[str, str]:
    """
    Returns a paginated, filterable audit trail of all sensitive actions:
    patient record creates/updates/deletes, health card issuances, user
    logins, role changes, and PHI views.

    Supports query params:
      user_id, action (CREATE|UPDATE|DELETE|VIEW|LOGIN),
      entity_type, entity_id, date_from, date_to, page, page_size.

    Auth: Admin only.
    Full implementation: Phase 6 — Hardening & UAT.
    """
    return {"message": "TODO: Phase 6 — list audit logs"}
