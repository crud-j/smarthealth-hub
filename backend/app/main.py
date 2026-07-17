"""
SmartHealth Hub — FastAPI application entry point.

Startup order:
  1. Load settings from environment (.env via pydantic-settings)
  2. Configure CORS
  3. Mount API v1 router (added in Phase 1)
  4. Register exception handlers (added in Phase 1)

Run locally:
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(
    title="SmartHealth Hub API",
    version="0.1.0",
    description=(
        "Integrated Health Care Information Management System for Barangay Health Centers. "
        "Provides REST endpoints for patient records, appointments, health cards, "
        "immunizations, analytics, MFA authentication, and SMS notifications."
    ),
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API v1 router (uncomment in Phase 1 once endpoints are implemented) ────────
# from app.api.v1.router import api_router
# app.include_router(api_router, prefix="/api/v1")


# ── Health check (public — no auth required) ──────────────────────────────────
@app.get("/health", tags=["health"], summary="Service health check")
async def health_check() -> dict[str, str]:
    """Returns 200 OK when the API service is running."""
    return {"status": "ok", "service": "smarthealth-hub-api"}
