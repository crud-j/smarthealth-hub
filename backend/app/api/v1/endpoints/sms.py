"""
SMS-related endpoints.

Public (webhook, validated by Semaphore signature):
  POST /sms/webhook/delivery-status  — Semaphore delivery status callback

Protected (Admin / Admin Staff only):
  GET  /sms/logs                     — paginated SMS dispatch log
  POST /sms/send-test                — send a test SMS (dev/staging only)

Full implementation: Phase 4 (Appointments & SMS).
"""

from fastapi import APIRouter

router = APIRouter()

# TODO (Phase 4): Implement delivery-status webhook and SMS log endpoints.
