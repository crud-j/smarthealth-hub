"""
Custom application exceptions and FastAPI exception handlers.

Centralising exception types here ensures consistent HTTP error shapes
across all endpoints (matches the API contract in the SDP).
"""

# TODO (Phase 1): Implement:
#   - class SmartHealthError(Exception): base with status_code + detail
#   - class NotFoundError(SmartHealthError): 404
#   - class ForbiddenError(SmartHealthError): 403
#   - class ConflictError(SmartHealthError): 409
#   - class ValidationError(SmartHealthError): 422
#   - register_exception_handlers(app: FastAPI) -> None
