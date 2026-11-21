"""
Role-based dashboard.

Routes:
  GET /dashboard/me
      The signed-in user's dashboard: what it contains depends on the role
      (physician, bhw, admin, admin_staff) and is decided here, not in the
      browser.  Response is discriminated by ``role``.

Auth: JWT required; the four staff roles each get their own payload.
Audit: none.  Counts and short lists (names/codes like GET /patients, which
is not PHI-VIEW audited); never diagnosis or treatment text.  Opening a
patient from a list goes through the audited detail endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.security import require_role
from app.db.session import DbDep
from app.models.user import User
from app.schemas.dashboard import RoleDashboard
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

_STAFF = require_role("physician", "bhw", "admin", "admin_staff")


@router.get(
    "/me",
    response_model=RoleDashboard,
    summary="The signed-in user's role-based dashboard",
)
async def my_dashboard(db: DbDep, current_user: User = _STAFF) -> RoleDashboard:
    return await dashboard_service.build_dashboard(db, current_user)
