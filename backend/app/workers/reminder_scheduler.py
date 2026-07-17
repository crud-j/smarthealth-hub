"""
Reminder scheduler — Celery Beat periodic task that scans upcoming appointments
and enqueues SMS reminder tasks for those falling within the lead-time window.

Beat task to implement (Phase 4):
  - check_and_schedule_reminders() — runs every hour via beat schedule.
    Queries appointments where:
      scheduled_at BETWEEN now() + (lead_hours - 1h) AND now() + lead_hours
      AND status = 'scheduled'
      AND sms_reminder_task_id IS NULL
    Enqueues send_sms_reminder(appointment_id) for each match.

Full implementation: Phase 4 (Appointments & SMS).
"""

from app.workers.celery_app import celery_app  # noqa: F401

# TODO (Phase 4): Implement check_and_schedule_reminders periodic task.
