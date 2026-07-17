"""
Pytest configuration and shared fixtures for SmartHealth Hub API tests.

Full test infrastructure implementation: Phase 1 (Foundation).
"""

# TODO (Phase 1): Implement test fixtures:
#   - async_client: AsyncClient using httpx with TestClient wrapping the FastAPI app
#   - db_session: in-memory SQLite or test PostgreSQL session with rollback teardown
#   - test_user: pre-seeded User instances for each role (admin, bhw, physician, admin_staff)
#   - auth_headers(role): returns Authorization header dict with valid test JWT
