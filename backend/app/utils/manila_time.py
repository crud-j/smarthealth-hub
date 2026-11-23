"""
Manila time for appointment times.

The health center works on Manila time, but the server may not: the
production backend container runs on UTC. A datetime without a timezone is
read by the database driver in the server's own timezone, so such values
must be pinned to Manila before they are saved, and stored (UTC) times must
be converted back to Manila before they are shown in an SMS.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func

MANILA = ZoneInfo("Asia/Manila")


def manila_day(column: Any) -> Any:
    """SQL: the Manila calendar date of a timestamptz column.

    ``func.date(column)`` alone gives the date in the database session's
    timezone, which is UTC in production: a 7:30 AM Manila time (23:30 UTC)
    would fall on the day before.
    """
    return func.date(func.timezone("Asia/Manila", column))


def assume_manila(value: datetime) -> datetime:
    """A time without a timezone is a Manila time; others are kept as given."""
    if value.tzinfo is None:
        return value.replace(tzinfo=MANILA)
    return value


def to_manila(value: datetime) -> datetime:
    """The same moment on the Manila clock (for SMS text and display)."""
    return assume_manila(value).astimezone(MANILA)
