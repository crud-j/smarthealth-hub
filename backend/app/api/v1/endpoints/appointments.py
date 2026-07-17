"""
Appointment management endpoints.

  GET    /appointments              — list with filters (date range, status, provider)
  POST   /appointments              — schedule appointment + enqueue SMS reminder
  GET    /appointments/{id}         — appointment detail
  PATCH  /appointments/{id}         — update (reschedule / cancel / mark no-show)
  DELETE /appointments/{id}         — cancel and revoke pending SMS task

Full implementation: Phase 4 (Appointments & SMS).
"""

from fastapi import APIRouter

router = APIRouter()

# TODO (Phase 4): Implement with Celery SMS reminder task scheduling.
