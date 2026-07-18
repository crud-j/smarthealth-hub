"""
Custom application exceptions and FastAPI exception handlers.

All application-level errors inherit from ``AppError``.  Every exception is
converted to a uniform JSON envelope by the registered handlers so API
consumers always parse the same shape, regardless of whether the error
originated in application code, Pydantic validation, or SQLAlchemy.

Error envelope::

    {
        "error": {
            "code":    "not_found",
            "message": "Patient not found",
            "detail":  {}          // optional structured context
        }
    }

Register all handlers by calling ``register_exception_handlers(app)`` once
during application startup (in ``main.py``).
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger("smarthealth.exceptions")


# ---------------------------------------------------------------------------
# Base exception
# ---------------------------------------------------------------------------


class AppError(Exception):
    """
    Base class for all SmartHealth Hub application errors.

    Subclass this to define domain-specific errors.  FastAPI's registered
    handler converts any ``AppError`` instance to a structured JSON response
    using ``status_code`` and ``code`` from the class definition, plus the
    ``message`` and ``detail`` supplied at raise-time.

    Args:
        message: Human-readable description of what went wrong.
        detail:  Optional structured context (IDs, field names, etc.) that
                 the frontend can use to display a targeted error message.
    """

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "internal_error"

    def __init__(self, message: str, detail: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail or {}


# ---------------------------------------------------------------------------
# Concrete exception classes
# ---------------------------------------------------------------------------


class NotFoundError(AppError):
    """
    Raised when a requested resource does not exist or is not visible to the
    current user (to avoid information leakage about existence).

    HTTP 404 Not Found.
    """

    status_code: int = status.HTTP_404_NOT_FOUND
    code: str = "not_found"


class ForbiddenError(AppError):
    """
    Raised when an authenticated user attempts an action that their role does
    not permit.

    HTTP 403 Forbidden.
    """

    status_code: int = status.HTTP_403_FORBIDDEN
    code: str = "forbidden"


class ConflictError(AppError):
    """
    Raised when an operation violates a uniqueness constraint (e.g. duplicate
    email, duplicate patient code) or a business-rule conflict (e.g. trying to
    reissue an already-active card without revoking it first).

    HTTP 409 Conflict.
    """

    status_code: int = status.HTTP_409_CONFLICT
    code: str = "conflict"


class UnauthorizedError(AppError):
    """
    Raised when a request lacks valid authentication credentials.

    HTTP 401 Unauthorized.
    """

    status_code: int = status.HTTP_401_UNAUTHORIZED
    code: str = "unauthorized"


class ValidationError(AppError):
    """
    Raised when business-layer validation fails (distinct from Pydantic
    schema validation — use this for rules that cannot be expressed in a
    Pydantic model, e.g. "appointment date must be in the future").

    HTTP 422 Unprocessable Entity.
    """

    status_code: int = status.HTTP_422_UNPROCESSABLE_ENTITY
    code: str = "validation_error"


class TooManyRequestsError(AppError):
    """
    Raised when a client exceeds the allowed request rate for a given
    key (e.g. login attempts per IP + email combination).

    HTTP 429 Too Many Requests.
    """

    status_code: int = status.HTTP_429_TOO_MANY_REQUESTS
    code: str = "too_many_requests"


# ---------------------------------------------------------------------------
# Response builder
# ---------------------------------------------------------------------------


def _error_response(
    status_code: int,
    code: str,
    message: str,
    detail: dict[str, Any] | None = None,
) -> JSONResponse:
    """Build the standard error JSON envelope."""
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "detail": detail or {},
            }
        },
    )


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


async def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Convert any ``AppError`` subclass to a structured JSON response."""
    # Log at WARNING for client errors, ERROR for server errors.
    if exc.status_code >= 500:
        logger.error(
            "Server error",
            extra={
                "error_code": exc.code,
                "error_message": exc.message,
                "path": request.url.path,
                "detail": exc.detail,
            },
        )
    else:
        logger.warning(
            "Client error",
            extra={
                "error_code": exc.code,
                "error_message": exc.message,
                "path": request.url.path,
            },
        )
    return _error_response(exc.status_code, exc.code, exc.message, exc.detail)


async def _pydantic_validation_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """
    Convert Pydantic ``RequestValidationError`` (raised by FastAPI when the
    incoming request body/query params fail schema validation) to the standard
    error envelope.

    The raw Pydantic errors are placed in ``detail.errors`` so the frontend
    can highlight specific fields.
    """
    errors = exc.errors()
    # Convert any non-serialisable types (e.g. PydanticUndefined) to strings.
    serialisable_errors = []
    for err in errors:
        serialisable_errors.append(
            {
                "loc": list(err.get("loc", [])),
                "msg": err.get("msg", ""),
                "type": err.get("type", ""),
            }
        )
    logger.warning(
        "Request validation error",
        extra={"path": request.url.path, "errors": serialisable_errors},
    )
    return _error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        code="validation_error",
        message="Request validation failed",
        detail={"errors": serialisable_errors},
    )


async def _integrity_error_handler(
    request: Request, exc: IntegrityError
) -> JSONResponse:
    """
    Convert SQLAlchemy ``IntegrityError`` (unique constraint violations, FK
    violations) to a 409 Conflict response.

    The raw DB error is logged server-side but NOT surfaced to the client to
    avoid leaking schema details.
    """
    logger.error(
        "Database integrity error",
        extra={"path": request.url.path, "orig": str(exc.orig)},
    )
    return _error_response(
        status_code=status.HTTP_409_CONFLICT,
        code="conflict",
        message="A resource with the given data already exists or a constraint was violated.",
        detail={},
    )


async def _unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """
    Catch-all for any exception not matched by more specific handlers.

    Returns a generic 500 so internal details are never disclosed to clients.
    """
    logger.exception(
        "Unhandled exception",
        extra={"path": request.url.path},
        exc_info=exc,
    )
    return _error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="internal_error",
        message="An unexpected error occurred. Please try again or contact support.",
        detail={},
    )


# ---------------------------------------------------------------------------
# Registration function
# ---------------------------------------------------------------------------


def register_exception_handlers(app: FastAPI) -> None:
    """
    Register all exception handlers on the FastAPI application instance.

    Call this once in ``main.py`` before any routes are included::

        from app.core.exceptions import register_exception_handlers
        register_exception_handlers(app)

    Handler precedence (FastAPI matches the most specific type first):
      1. AppError subclasses (domain errors)
      2. RequestValidationError (Pydantic schema failures)
      3. IntegrityError (SQLAlchemy DB constraint violations)
      4. Exception (fallback catch-all)
    """
    app.add_exception_handler(AppError, _app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _pydantic_validation_handler)  # type: ignore[arg-type]
    app.add_exception_handler(IntegrityError, _integrity_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _unhandled_exception_handler)
