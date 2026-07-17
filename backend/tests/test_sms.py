"""
Tests for SMS dispatch and appointment reminder tasks (Phase 4).

Covers:
  - SmsService.send() — mocked Semaphore API, SmsLog record created
  - send_sms_reminder Celery task — retries on failure, does not raise on max retries
  - POST /sms/webhook/delivery-status — updates SmsLog.status
  - Appointment creation enqueues reminder task with correct eta

Full implementation: Phase 4 (Appointments & SMS).
"""


def test_placeholder() -> None:
    """Placeholder test — passes until Phase 4 SMS tests are implemented."""
    assert True
