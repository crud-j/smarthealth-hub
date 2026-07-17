"""
Authentication endpoints.

Public routes (no JWT required):
  POST /auth/login             — password credential check, returns step=otp_required
  POST /auth/forgot-password   — trigger SMS-based reset

Protected routes (JWT required):
  POST /auth/refresh           — rotate access token using refresh token
  POST /auth/logout            — invalidate refresh token

Full implementation: Phase 1 (Foundation & Auth).
"""

from fastapi import APIRouter

router = APIRouter()

# TODO (Phase 1): Implement login, refresh, logout, forgot-password endpoints.
