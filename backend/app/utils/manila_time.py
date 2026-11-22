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
from zoneinfo import ZoneInfo

MANILA = ZoneInfo("Asia/Manila")


def assume_manila(value: datetime) -> datetime:
    """A time without a timezone is a Manila time; others are kept as given."""
    if value.tzinfo is None:
        return value.replace(tzinfo=MANILA)
    return value


def to_manila(value: datetime) -> datetime:
    """The same moment on the Manila clock (for SMS text and display)."""
    return assume_manila(value).astimezone(MANILA)
