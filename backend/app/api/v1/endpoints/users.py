"""
User (staff account) management endpoints (Phase 1 stubs).

All routes are Admin-only.

  GET    /users       — list all staff accounts
  POST   /users       — create a new staff account
  PUT    /users/{id}  — update role, contact info, or active status
  DELETE /users/{id}  — deactivate (soft-delete) a staff account

Auth: Admin role required on all routes.

SDP Reference: Section 6.9
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", summary="List all staff accounts (Admin only)")
async def list_users() -> dict[str, str]:
    """
    Returns all user (staff) accounts including role, active status,
    and last login timestamp.

    Supports query params: role, is_active, page, page_size.

    Auth: Admin only.
    Full implementation: Phase 1 — Foundation & Auth.
    """
    return {"message": "TODO: Phase 1 — list users"}


@router.post("", summary="Create a new staff account (Admin only)", status_code=201)
async def create_user() -> dict[str, str]:
    """
    Creates a new staff account (BHW, Physician, Nurse, Midwife, Admin Staff).

    A temporary password is generated and sent to the user's mobile via SMS.
    MFA is enabled by default on all new accounts.

    Auth: Admin only.
    Full implementation: Phase 1 — Foundation & Auth.
    """
    return {"message": "TODO: Phase 1 — create user"}


@router.put("/{id}", summary="Update staff account (role, contact, status)")
async def update_user(id: uuid.UUID) -> dict[str, str]:
    """
    Updates a staff account's role assignment, contact information, or
    active status.

    Changing a user's role takes effect on their next login (token refresh).

    Auth: Admin only.
    Full implementation: Phase 1 — Foundation & Auth.
    """
    return {"message": f"TODO: Phase 1 — update user {id}"}


@router.delete("/{id}", summary="Deactivate a staff account (Admin only)")
async def deactivate_user(id: uuid.UUID) -> dict[str, str]:
    """
    Sets ``is_active=False`` on the user record.  Does not hard-delete.
    Active sessions for the deactivated user are invalidated on the next
    token validation cycle.

    Auth: Admin only.
    Full implementation: Phase 1 — Foundation & Auth.
    """
    return {"message": f"TODO: Phase 1 — deactivate user {id}"}
