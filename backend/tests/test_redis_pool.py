"""
The shared async Redis pool must belong to the running event loop.

DB-free (no Redis server needed: creating a client does not connect).

redis.asyncio connections are bound to the loop that opened them. pytest
gives each test a new loop and Celery tasks call ``asyncio.run`` per task, so
a pool cached from an earlier loop fails on every call ("Event loop is
closed"), and every Redis-backed check (token revocation, rate limits)
silently failed open in the test suite.
"""

from __future__ import annotations

import asyncio

from app.core import security


async def _pool_twice() -> tuple[object, object]:
    return security.get_shared_redis(), security.get_shared_redis()


def test_same_loop_reuses_one_pool() -> None:
    first, second = asyncio.run(_pool_twice())
    assert first is second


def test_new_loop_gets_a_new_pool() -> None:
    first, _ = asyncio.run(_pool_twice())
    second, _ = asyncio.run(_pool_twice())
    assert first is not second
