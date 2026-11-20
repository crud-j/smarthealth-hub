"""
Tests for the Redis-backed rate limiter (app.core.rate_limit).

DB-free: uses fakeredis, so it runs with ``--noconftest`` on any PC.

Why it exists: production runs two API worker processes. A per-process
counter let an attacker make 5 login attempts *per worker* and was wiped on
every deploy. The Redis counter is shared by all workers and survives
restarts; if Redis is down the limiter falls back to a per-process counter so
logins never fail because of Redis.
"""

from __future__ import annotations

import fakeredis
import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core.exceptions import TooManyRequestsError
from app.core.rate_limit import InMemoryRateLimiter, RedisRateLimiter


class Clock:
    """Controllable wall clock (seconds)."""

    def __init__(self, start: float = 1_000_000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now


class BrokenRedis:
    """Stands in for an unreachable Redis server."""

    def __init__(self) -> None:
        self.calls = 0

    def pipeline(self, *args: object, **kwargs: object) -> object:
        self.calls += 1
        raise RedisConnectionError("Redis is down")


def make_limiter(redis: object, clock: Clock | None = None) -> RedisRateLimiter:
    return RedisRateLimiter(redis_factory=lambda: redis, clock=clock or Clock())


async def hit(limiter: RedisRateLimiter, times: int, key: str = "login:ip:a@b.c") -> None:
    for _ in range(times):
        await limiter.check_rate_limit(key=key, max_attempts=5, window_seconds=900)


@pytest.mark.asyncio
async def test_allows_up_to_max_then_blocks() -> None:
    limiter = make_limiter(fakeredis.FakeAsyncRedis())
    await hit(limiter, 5)
    with pytest.raises(TooManyRequestsError):
        await hit(limiter, 1)


@pytest.mark.asyncio
async def test_two_workers_share_one_limit() -> None:
    """The bug this fixes: each worker used to allow 5 attempts on its own."""
    server = fakeredis.FakeServer()
    worker_a = make_limiter(fakeredis.FakeAsyncRedis(server=server))
    worker_b = make_limiter(fakeredis.FakeAsyncRedis(server=server))

    await hit(worker_a, 3)
    await hit(worker_b, 2)
    with pytest.raises(TooManyRequestsError):
        await hit(worker_a, 1)
    with pytest.raises(TooManyRequestsError):
        await hit(worker_b, 1)


@pytest.mark.asyncio
async def test_limit_survives_a_restart() -> None:
    """A deploy creates new limiter objects; the count lives in Redis."""
    server = fakeredis.FakeServer()
    await hit(make_limiter(fakeredis.FakeAsyncRedis(server=server)), 5)

    after_restart = make_limiter(fakeredis.FakeAsyncRedis(server=server))
    with pytest.raises(TooManyRequestsError):
        await hit(after_restart, 1)


@pytest.mark.asyncio
async def test_keys_are_independent() -> None:
    limiter = make_limiter(fakeredis.FakeAsyncRedis())
    await hit(limiter, 5, key="login:ip:one@b.c")
    await hit(limiter, 5, key="login:ip:two@b.c")  # does not raise


@pytest.mark.asyncio
async def test_window_slides() -> None:
    clock = Clock()
    limiter = make_limiter(fakeredis.FakeAsyncRedis(), clock)
    await hit(limiter, 5)

    clock.now += 899
    with pytest.raises(TooManyRequestsError):
        await hit(limiter, 1)

    clock.now += 2  # the first attempts are now older than 900 s
    await hit(limiter, 1)


@pytest.mark.asyncio
async def test_blocked_attempts_do_not_extend_the_lockout() -> None:
    clock = Clock()
    limiter = make_limiter(fakeredis.FakeAsyncRedis(), clock)
    await hit(limiter, 5)

    for _ in range(10):
        clock.now += 60
        with pytest.raises(TooManyRequestsError):
            await hit(limiter, 1)

    clock.now = 1_000_000.0 + 901  # 15 min after the 5 counted attempts
    await hit(limiter, 1)


@pytest.mark.asyncio
async def test_redis_keys_expire() -> None:
    redis = fakeredis.FakeAsyncRedis()
    limiter = make_limiter(redis)
    await hit(limiter, 1)

    keys = await redis.keys("ratelimit:*")
    assert keys == [b"ratelimit:login:ip:a@b.c"]
    ttl = await redis.ttl(keys[0])
    assert 0 < ttl <= 900


@pytest.mark.asyncio
async def test_falls_back_to_memory_when_redis_is_down() -> None:
    """Redis trouble never blocks a login, but the limit still applies."""
    limiter = make_limiter(BrokenRedis())
    await hit(limiter, 5)
    with pytest.raises(TooManyRequestsError):
        await hit(limiter, 1)


@pytest.mark.asyncio
async def test_skips_redis_for_a_while_after_a_failure() -> None:
    """Avoids paying the Redis connect timeout on every request during an outage."""
    clock = Clock()
    redis = BrokenRedis()
    limiter = make_limiter(redis, clock)

    await hit(limiter, 3)
    assert redis.calls == 1

    clock.now += 31
    await hit(limiter, 1)
    assert redis.calls == 2


def test_in_memory_limiter_still_exported() -> None:
    assert isinstance(InMemoryRateLimiter(), InMemoryRateLimiter)
