"""
API v1 root router — aggregates all domain sub-routers into a single
``APIRouter`` that is mounted at ``/api/v1`` in ``main.py``.

Mounting strategy:
  - Routers with a natural resource prefix (auth, mfa, patients, appointments,
    analytics, sms, users, audit) are included with their prefix defined in
    the sub-router itself.
  - Routers whose routes are nested under another resource's path
    (medical_history, immunizations, health_cards) use full path expressions
    inside the router and are included here without an additional prefix, to
    avoid double-prefixing (e.g. /patients/{id}/medical-history is already the
    full path inside medical_history.router).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    analytics,
    appointments,
    audit,
    auth,
    health_cards,
    immunizations,
    medical_history,
    mfa,
    patients,
    sms,
    users,
)

api_router = APIRouter()

# ── Auth & MFA ───────────────────────────────────────────────────────────────
# auth.router already carries prefix="/auth"
api_router.include_router(auth.router)

# mfa.router already carries prefix="/mfa"
api_router.include_router(mfa.router)

# ── Patient records ───────────────────────────────────────────────────────────
# patients.router already carries prefix="/patients"
api_router.include_router(patients.router)

# Nested under /patients/{patient_id}/... — full paths live in the router.
api_router.include_router(medical_history.router)
api_router.include_router(immunizations.router)

# ── Appointments ──────────────────────────────────────────────────────────────
# appointments.router already carries prefix="/appointments"
api_router.include_router(appointments.router)

# ── Health cards ──────────────────────────────────────────────────────────────
# Full paths live in health_cards.router — no additional prefix here.
api_router.include_router(health_cards.router)

# ── Analytics ─────────────────────────────────────────────────────────────────
# analytics.router already carries prefix="/analytics"
api_router.include_router(analytics.router)

# ── SMS ───────────────────────────────────────────────────────────────────────
# sms.router already carries prefix="/sms"
api_router.include_router(sms.router)

# ── User management ───────────────────────────────────────────────────────────
# users.router already carries prefix="/users"
api_router.include_router(users.router)

# ── Audit logs ────────────────────────────────────────────────────────────────
# audit.router already carries prefix="/audit-logs"
api_router.include_router(audit.router)
