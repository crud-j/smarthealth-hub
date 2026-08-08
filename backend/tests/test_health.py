"""
Tests for the /health and /health/db liveness endpoints.

These endpoints are public (no auth required).

Fixtures from conftest.py: client
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_returns_ok(client: AsyncClient) -> None:
    """GET /health returns 200 with status=ok."""
    response = await client.get("/health")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body.get("status") == "ok"


@pytest.mark.asyncio
async def test_health_db_returns_ok(client: AsyncClient) -> None:
    """GET /health/db returns 200 when the test database is reachable."""
    response = await client.get("/health/db")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body.get("status") == "ok"
    assert body.get("database") == "connected"
