"""
In-memory rate limiter for auth endpoints.

Provides a simple sliding-window counter using a dict of deques (one deque
per key).  Concurrency is serialised with an ``asyncio.Lock`` so simultaneous
coroutines operating on the same key do not race.

Limitations / production upgrade path:
  - State is per-process and is lost on restart — acceptable for Phase 1
    single-process development.
  - Replace ``InMemoryRateLimiter`` with a Redis-backed implementation before
    multi-instance deployment (e.g. use ``redis.asyncio`` with ZADD/ZCOUNT on
    a sorted-set per key + an expiring TTL key for automatic cleanup).
  - For Celery worker processes, always use the Redis-backed version because
    each worker is a separate process.

Usage::

    from app.core.rate_limit import limiter
    from app.core.exceptions import TooManyRequestsError

    # In a route handler:
    await limiter.check_rate_limit(
        key=f"login:{client_ip}:{email}",
        max_attempts=5,
        window_seconds=900,  # 15 minutes
    )
"""

from __future__ import annotations

import asyncio
import time
from collections import deque


class InMemoryRateLimiter:
    """
    Sliding-window in-memory rate limiter.

    Tracks the timestamps of recent requests for each ``key`` string.
    When ``check_rate_limit`` is called it:
      1. Drops timestamps older than ``window_seconds`` from the deque.
      2. Raises ``TooManyRequestsError`` if the remaining count >= ``max_attempts``.
      3. Appends the current timestamp so the new request is counted.

    Thread/async safety: a single ``asyncio.Lock`` guards the shared state.

    NOTE: Replace with a Redis-backed implementation before multi-instance deployment.
    """

    def __init__(self) -> None:
        # Dict mapping key string → deque of Unix timestamps (float).
        self._windows: dict[str, deque[float]] = {}
        self._lock: asyncio.Lock = asyncio.Lock()

    async def check_rate_limit(
        self,
        key: str,
        max_attempts: int,
        window_seconds: int,
    ) -> None:
        """
        Assert that ``key`` has not exceeded ``max_attempts`` within the last
        ``window_seconds``.

        Args:
            key:            Unique rate-limit key, e.g. ``f"login:{ip}:{email}"``.
            max_attempts:   Maximum allowed attempts within the window.
            window_seconds: Rolling window duration in seconds.

        Raises:
            TooManyRequestsError: If the limit is exceeded.  Callers should
                                  allow FastAPI's exception handler to convert
                                  this to a 429 response.
        """
        # Import here to avoid a circular import (exceptions → rate_limit).
        from app.core.exceptions import TooManyRequestsError

        now = time.monotonic()
        cutoff = now - window_seconds

        async with self._lock:
            window = self._windows.setdefault(key, deque())

            # Remove expired timestamps from the left of the deque.
            while window and window[0] < cutoff:
                window.popleft()

            if len(window) >= max_attempts:
                raise TooManyRequestsError(
                    f"Too many requests. Please wait before trying again.",
                    detail={
                        "key": key,
                        "max_attempts": max_attempts,
                        "window_seconds": window_seconds,
                    },
                )

            # Record this attempt.
            window.append(now)


# ---------------------------------------------------------------------------
# Module-level singleton — import and use directly in route handlers.
# ---------------------------------------------------------------------------

limiter = InMemoryRateLimiter()
