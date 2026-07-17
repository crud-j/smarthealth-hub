"""
SMS dispatch service — wraps the Semaphore API.

Responsibilities:
  - Send SMS messages via Semaphore REST API
  - Handle HTTP errors + retry logic (up to SMS_MAX_RETRIES)
  - Persist SmsLog record for each attempt
  - Never block core clinical workflows on SMS failure

Full implementation: Phase 4 (Appointments & SMS).
"""

# TODO (Phase 4): Implement SmsService class with:
#   async send(recipient: str, message: str, context: dict) -> SmsLog
#   Uses httpx.AsyncClient with Semaphore API key from settings.
