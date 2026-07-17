"""
Celery SMS tasks — dispatched when appointments are scheduled or reminders are due.

Tasks to implement (Phase 4):
  - send_sms_reminder(appointment_id: str) -> None
      Fetches appointment + patient from DB, formats message,
      calls SmsService.send(), updates SmsLog status.
      Retries up to SMS_MAX_RETRIES with exponential backoff.
      Failure is logged but never propagated to block clinical workflow.

Full implementation: Phase 4 (Appointments & SMS).
"""

from app.workers.celery_app import celery_app  # noqa: F401

# TODO (Phase 4): Implement send_sms_reminder Celery task.
# @celery_app.task(bind=True, max_retries=settings.SMS_MAX_RETRIES, ...)
# def send_sms_reminder(self, appointment_id: str) -> None: ...
