"""
Rate limiter for auth and other abuse-prone endpoints.

``limiter`` (the module singleton every endpoint uses) is a
``RedisRateLimiter``: one sliding-window counter per key, stored in Redis, so
the limit is shared by every API worker process and survives restarts and
deploys. Production runs two uvicorn workers (``API_WORKERS``); with the old
per-process counter each worker allowed the full quota on its own and every
deploy reset it.

If Redis is unreachable the limiter falls back to a per-process
``InMemoryRateLimiter`` (the limit still applies, per worker) and skips Redis
for ``retry_after_failure_seconds`` so an outage does not add a connect
timeout to every request. Rate limiting never makes a request fail because of
Redis.

Usage::

    from app.core.rate_limit import limiter

    # In a route handler:
    await limiter.check_rate_limit(
        key=f"login:{client_ip}:{email}",
        max_attempts=5,
        window_seconds=900,  # 15 minutes
    )
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections import deque
from collections.abc import Callable
from typing import Any

_logger = logging.getLogger(__name__)

_KEY_PREFIX = "ratelimit:"


def _too_many(key: str, max_attempts: int, window_seconds: int) -> Exception:
    # Import here to avoid a circular import (exceptions → rate_limit).
    from app.core.exceptions import TooManyRequestsError

    return TooManyRequestsError(
        "Too many requests. Please wait before trying again.",
        detail={
            "key": key,
            "max_attempts": max_attempts,
            "window_seconds": window_seconds,
        },
    )


class InMemoryRateLimiter:
    """
    Sliding-window per-process rate limiter (fallback when Redis is down).

    Tracks the timestamps of recent requests for each ``key`` string.
    When ``check_rate_limit`` is called it:
      1. Drops timestamps older than ``window_seconds`` from the deque.
      2. Raises ``TooManyRequestsError`` if the remaining count >= ``max_attempts``.
      3. Appends the current timestamp so the new request is counted.

    Thread/async safety: a single ``asyncio.Lock`` guards the shared state.
    """

    def __init__(self) -> None:
        # Dict mapping key string → deque of monotonic timestamps (float).
        self._windows: dict[str, deque[float]] = {}
        self._lock: asyncio.Lock = asyncio.Lock()

    async def check_rate_limit(
        self,
        key: str,
        max_attempts: int,
        window_seconds: int,
    ) -> None:
        """
        Raise ``TooManyRequestsError`` if ``key`` already has ``max_attempts``
        attempts within the last ``window_seconds``; otherwise count this one.
        """
        now = time.monotonic()
        cutoff = now - window_seconds

        async with self._lock:
            window = self._windows.setdefault(key, deque())

            # Remove expired timestamps from the left of the deque.
            while window and window[0] < cutoff:
                window.popleft()

            if len(window) >= max_attempts:
                raise _too_many(key, max_attempts, window_seconds)

            # Record this attempt.
            window.append(now)


def _shared_redis() -> Any:
    # Lazy import: app.core.security imports config/exceptions; importing it at
    # module level here would make every rate_limit import pull in the JWT stack.
    from app.core.security import get_shared_redis

    return get_shared_redis()


class RedisRateLimiter:
    """
    Sliding-window rate limiter shared by all processes through Redis.

    Each key is a sorted set ``ratelimit:{key}`` of attempt timestamps. One
    MULTI transaction drops expired entries, adds this attempt, counts, and
    refreshes the key's TTL, so two workers cannot both slip under the limit.
    A blocked attempt is removed again, so hammering a locked key does not
    extend the lockout (same behaviour as the in-memory limiter).
    """

    def __init__(
        self,
        *,
        redis_factory: Callable[[], Any] = _shared_redis,
        clock: Callable[[], float] = time.time,
        fallback: InMemoryRateLimiter | None = None,
        retry_after_failure_seconds: float = 30.0,
    ) -> None:
        self._redis_factory = redis_factory
        self._clock = clock
        self._fallback = fallback or InMemoryRateLimiter()
        self._retry_after_failure = retry_after_failure_seconds
        self._skip_redis_until = 0.0

    async def check_rate_limit(
        self,
        key: str,
        max_attempts: int,
        window_seconds: int,
    ) -> None:
        """
        Raise ``TooManyRequestsError`` if ``key`` already has ``max_attempts``
        attempts within the last ``window_seconds``; otherwise count this one.

        Callers let FastAPI's exception handler turn the error into HTTP 429.
        """
        now = self._clock()
        if now < self._skip_redis_until:
            await self._fallback.check_rate_limit(key, max_attempts, window_seconds)
            return

        redis_key = f"{_KEY_PREFIX}{key}"
        member = f"{now}:{uuid.uuid4().hex}"
        try:
            redis = self._redis_factory()
            pipe = redis.pipeline(transaction=True)
            pipe.zremrangebyscore(redis_key, 0, now - window_seconds)
            pipe.zadd(redis_key, {member: now})
            pipe.zcard(redis_key)
            pipe.expire(redis_key, window_seconds)
            _, _, count, _ = await pipe.execute()
            if count > max_attempts:
                await redis.zrem(redis_key, member)
        except (Exception, asyncio.CancelledError) as exc:  # noqa: BLE001
            # CancelledError is a BaseException; a dropped Redis connection on
            # Windows can surface as one. Never let Redis turn into a 500.
            self._skip_redis_until = now + self._retry_after_failure
            _logger.warning(
                "rate limiter: Redis unavailable, using per-process limits for %.0fs. Error: %s",
                self._retry_after_failure,
                exc,
            )
            await self._fallback.check_rate_limit(key, max_attempts, window_seconds)
            return

        if count > max_attempts:
            raise _too_many(key, max_attempts, window_seconds)


# ---------------------------------------------------------------------------
# Module-level singleton — import and use directly in route handlers.
# ---------------------------------------------------------------------------

limiter = RedisRateLimiter()
