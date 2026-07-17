"""
Shared Pydantic field validators and standalone validation helpers.

Full implementation: Phase 1+ (used progressively as schemas are built).
"""

# TODO: Implement as validators are needed:
#   def validate_ph_mobile(v: str) -> str:
#       "Validates Philippine mobile number format: +639XXXXXXXXX"
#
#   def validate_past_date(v: date) -> date:
#       "Ensures date is in the past (for birth_date, diagnosis_date, etc.)"
#
#   def validate_future_datetime(v: datetime) -> datetime:
#       "Ensures datetime is in the future (for appointment scheduling)"
#
#   def sanitize_string(v: str) -> str:
#       "Strips leading/trailing whitespace and normalizes unicode"
