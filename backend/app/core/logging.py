"""
Structured JSON logging for the SmartHealth Hub API.

Every log record is serialised as a single JSON object — one per line — so
log-aggregation tools (Loki, CloudWatch, Datadog, etc.) can ingest and filter
by any field without regex parsing.

Standard fields emitted on every record:
  timestamp  — ISO 8601, UTC, microsecond precision
  level      — DEBUG / INFO / WARNING / ERROR / CRITICAL
  logger     — dotted Python logger name (e.g. "app.api.v1.endpoints.patients")
  message    — the human-readable log message
  module     — Python module file (without .py)
  function   — function/method that called the logger
  line       — source line number

Any keyword arguments passed to ``logger.info(..., extra={...})`` are merged
into the top-level JSON object, making per-request context (patient_id,
user_id, request_id, action) trivially searchable.

Usage::

    from app.core.logging import get_logger
    logger = get_logger(__name__)

    logger.info("Patient created", extra={"patient_id": str(patient.id)})
    logger.error("SMS send failed", extra={"mobile": mobile, "error": str(e)})
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any


# ---------------------------------------------------------------------------
# JSON formatter
# ---------------------------------------------------------------------------


class JsonFormatter(logging.Formatter):
    """
    Formats a ``LogRecord`` as a single-line JSON object.

    Extra context injected via ``extra={}`` in the log call is merged directly
    into the top-level JSON object; there is no nesting — this keeps filter
    syntax flat in log aggregators.

    Fields are ordered for human readability when tailing logs locally:
    timestamp → level → logger → message → module → function → line → <extras>
    """

    # Keys that are always present as dedicated fields — we skip them from the
    # generic "extras" scan so they are not duplicated.
    _RESERVED: frozenset[str] = frozenset(
        {
            "name", "msg", "args", "created", "levelname", "levelno",
            "pathname", "filename", "module", "funcName", "lineno",
            "msecs", "relativeCreated", "thread", "threadName",
            "processName", "process", "exc_info", "exc_text",
            "stack_info", "taskName", "message",
        }
    )

    def format(self, record: logging.LogRecord) -> str:
        # Ensure the standard message is rendered first (handles % formatting).
        record.getMessage()

        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Merge any extras added via ``extra={"key": "value"}``
        for key, value in record.__dict__.items():
            if key not in self._RESERVED and not key.startswith("_"):
                payload[key] = value

        # Append exception traceback inline (makes it searchable)
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        if record.stack_info:
            payload["stack_info"] = self.formatStack(record.stack_info)

        return json.dumps(payload, default=str, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Logging bootstrap
# ---------------------------------------------------------------------------


def _configure_logging(log_level: str = "INFO") -> None:
    """
    Configure the root logger and the ``smarthealth`` hierarchy logger.

    Called once at module import so that any code importing ``get_logger``
    before ``main.py`` runs still gets structured output.

    Args:
        log_level: Logging level string, e.g. "DEBUG", "INFO", "WARNING".
    """
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    # Root logger: catch everything and emit JSON to stdout.
    root = logging.getLogger()
    root.setLevel(numeric_level)
    # Avoid duplicate handlers if _configure_logging is somehow called twice.
    if not root.handlers:
        root.addHandler(handler)
    else:
        root.handlers = [handler]

    # SmartHealth namespace logger — inherits root handler but can be
    # independently adjusted (e.g. set to DEBUG in development).
    sh_logger = logging.getLogger("smarthealth")
    sh_logger.setLevel(numeric_level)
    # Let records propagate to root so there's only one handler doing I/O.
    sh_logger.propagate = True

    # Quiet down overly verbose third-party loggers.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("weasyprint").setLevel(logging.WARNING)
    logging.getLogger("fontTools").setLevel(logging.WARNING)


# Run once at import time with default level; callers can invoke again with
# a different level if they read it from settings after startup.
_configure_logging()


# ---------------------------------------------------------------------------
# Public factory function
# ---------------------------------------------------------------------------


def get_logger(name: str) -> logging.Logger:
    """
    Return a structured logger for the given name.

    Prefer ``__name__`` as the name so the logger hierarchy mirrors the
    Python package structure, making per-module filtering easy.

    Args:
        name: Logger name, typically ``__name__`` of the calling module.

    Returns:
        A ``logging.Logger`` instance that emits JSON-formatted records.

    Example::

        from app.core.logging import get_logger
        logger = get_logger(__name__)
        logger.info("Patient created", extra={"patient_id": str(patient.id)})
    """
    return logging.getLogger(name)
