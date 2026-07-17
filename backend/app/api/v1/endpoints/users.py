"""
User management endpoints (Admin role only).

  GET    /users          — list all system users
  POST   /users          — create a new user (BHW, Physician, Admin Staff)
  GET    /users/{id}     — get user details
  PATCH  /users/{id}     — update user info / role
  DELETE /users/{id}     — deactivate user account

Full implementation: Phase 1 (Foundation & Auth).
"""

from fastapi import APIRouter

router = APIRouter()

# TODO (Phase 1): Implement CRUD endpoints with Admin-only RBAC guard.
