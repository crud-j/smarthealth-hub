"""
Multi-Factor Authentication (OTP) endpoints.

Public routes (no JWT required):
  POST /auth/verify-otp   — validate SMS OTP, return access + refresh tokens
  POST /auth/resend-otp   — resend OTP to registered mobile number

Full implementation: Phase 1 (Foundation & Auth).
"""

from fastapi import APIRouter

router = APIRouter()

# TODO (Phase 1): Implement verify-otp and resend-otp endpoints.
