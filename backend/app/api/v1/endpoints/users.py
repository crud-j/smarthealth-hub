"""
User (staff account) management endpoints — Admin only (except /users/me).

Routes:
  GET    /users/roles  — Any authenticated role. Returns role list for dropdowns.
  GET    /users/me     — Any authenticated role. Returns the caller's own profile.
  GET    /users        — Admin only. Paginated staff list with filters.
  POST   /users        — Admin only. Create a new staff account.
  PUT    /users/{id}   — Admin only. Update a staff account.
  DELETE /users/{id}   — Admin only. Deactivate (soft-delete) a staff account.

Auth: require_role("admin") on all routes except GET /users/me (CurrentUser)
and GET /users/roles (CurrentUser).

IMPORTANT: GET /users/me and GET /users/roles must be registered BEFORE
GET /users/{id} to prevent FastAPI from interpreting "me" or "roles" as a UUID.

SDP Reference: Section 6.9
"""

from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.models.user import User
from app.schemas.user import (
    PaginatedUsers,
    RoleItem,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from app.services import user_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])

# Convenience type alias — resolves to the current authenticated user AND
# enforces the "admin" role in a single dependency.
AdminOnly = require_role("admin")


# ---------------------------------------------------------------------------
# GET /users/roles — any authenticated role
# MUST be registered before /{id} so "roles" isn't parsed as a UUID.
# ---------------------------------------------------------------------------


@router.get(
    "/roles",
    response_model=list[RoleItem],
    summary="List assignable roles (any authenticated role)",
)
async def list_roles(
    current_user: CurrentUser,
    db: DbDep,
) -> list[RoleItem]:
    """
    Returns the list of non-admin roles for use in Create/Edit User dropdowns.

    Admin role is excluded — admin accounts are created only via the seed script.
    """
    roles = await user_service.list_roles(db)
    return [RoleItem(id=r.id, name=r.name) for r in roles]


# ---------------------------------------------------------------------------
# GET /users/me — any authenticated role
# MUST be registered before /{id}.
# ---------------------------------------------------------------------------


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get own profile (any authenticated role)",
)
async def get_me(
    current_user: CurrentUser,
    db: DbDep,
) -> UserResponse:
    """
    Returns the authenticated user's own staff profile.

    No role restriction — every staff member can view their own profile.
    """
    user = await user_service.get_me(db, current_user.id)
    return UserResponse.model_validate(user)


# ---------------------------------------------------------------------------
# GET /users — Admin only
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=PaginatedUsers,
    summary="List all staff accounts (Admin only)",
)
async def list_users(
    current_user: Annotated[User, AdminOnly],
    db: DbDep,
    role: str | None = Query(None, description="Filter by role name"),
    is_active: bool | None = Query(None, description="Filter by active status"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Records per page (max 100)"),
) -> PaginatedUsers:
    """
    Returns a paginated list of staff accounts.

    Query params:
    - ``role``: filter by role name (bhw, physician, admin_staff, admin)
    - ``is_active``: filter by active status (true/false)
    - ``page``: page number (default 1)
    - ``page_size``: records per page (default 20, max 100)
    """
    users, total = await user_service.list_users(
        db,
        role=role,
        is_active=is_active,
        page=page,
        page_size=page_size,
    )
    return PaginatedUsers(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# POST /users — Admin only
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=UserResponse,
    status_code=201,
    summary="Create a new staff account (Admin only)",
)
async def create_user(
    body: UserCreate,
    current_user: Annotated[User, AdminOnly],
    db: DbDep,
) -> UserResponse:
    """
    Creates a new staff account (BHW, Physician, Nurse, Midwife, Admin Staff).

    A 16-character temporary password is auto-generated, hashed, and stored.
    The plaintext temp password is logged to the server console in development.
    MFA is enabled by default on all new accounts.

    TODO (Phase 6): Send temp password via Semaphore SMS to the new user's mobile.
    """
    user, temp_pw = await user_service.create_user(
        db,
        data=body,
        created_by=current_user.id,
    )
    # Log temp password to server console — never include in API response.
    logger.info(
        "New staff account created — temporary password for %s: %s",
        user.email,
        temp_pw,
    )
    return UserResponse.model_validate(user)


# ---------------------------------------------------------------------------
# PUT /users/{id} — Admin only
# ---------------------------------------------------------------------------


@router.put(
    "/{user_id}",
    response_model=UserResponse,
    summary="Update a staff account (Admin only)",
)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    current_user: Annotated[User, AdminOnly],
    db: DbDep,
) -> UserResponse:
    """
    Updates a staff account's role, contact information, or active status.

    Only fields present in the request body are updated (partial update).
    Changing a user's role takes effect on their next token refresh.
    """
    user = await user_service.update_user(
        db,
        user_id=user_id,
        data=body,
        updated_by=current_user.id,
    )
    return UserResponse.model_validate(user)


# ---------------------------------------------------------------------------
# DELETE /users/{id} — Admin only
# ---------------------------------------------------------------------------


@router.delete(
    "/{user_id}",
    status_code=204,
    summary="Deactivate a staff account (Admin only)",
)
async def deactivate_user(
    user_id: uuid.UUID,
    current_user: Annotated[User, AdminOnly],
    db: DbDep,
) -> Response:
    """
    Soft-deactivates a staff account (sets is_active=False).

    The user's refresh token is cleared immediately, invalidating their current
    session on the next access-token expiry.  This is a soft delete — the record
    is retained in the database for audit trail continuity.
    """
    await user_service.deactivate_user(
        db,
        user_id=user_id,
        deactivated_by=current_user.id,
    )
    return Response(status_code=204)
