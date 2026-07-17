"""
Audit log endpoints (Admin only).

  GET /audit/logs   — paginated audit trail with filters:
                      user_id, action, resource_type, date range

Audit logs are append-only. No DELETE or PATCH endpoints exist for this resource.

Full implementation: Phase 6 (Hardening & UAT).
"""

from fastapi import APIRouter

router = APIRouter()

# TODO (Phase 6): Implement read-only audit log listing with admin guard.
