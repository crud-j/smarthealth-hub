"""
SmartHealth Hub — FastAPI application entry point.

Startup sequence:
  1. Structured JSON logging is configured at import time (app.core.logging).
  2. The FastAPI application is created with OpenAPI docs at /docs and /redoc.
  3. CORS middleware is added (origins from settings.CORS_ORIGINS).
  4. Exception handlers are registered (converts all errors to a uniform JSON envelope).
  5. The API v1 router is mounted at /api/v1.
  6. Health-check endpoints are registered at /health and /health/db.

Interactive API docs (development):
  Swagger UI : http://localhost:8000/docs
  ReDoc      : http://localhost:8000/redoc
  OpenAPI JSON: http://localhost:8000/openapi.json

Run locally:
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Or via Turborepo:
  turbo dev --filter=backend
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import get_logger
from app.services.patient_photo_service import ensure_photo_dir

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Lifespan context manager
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Manages application startup and shutdown lifecycle.

    On startup: logs that the service is ready.  Future phases will add DB
    connection-pool warm-up and Celery worker health checks here.

    On shutdown: logs graceful teardown; SQLAlchemy engine disposes
    connections automatically when the process exits.
    """
    # Ensure the patient photos directory exists before any requests are served.
    # This is idempotent (mkdir parents=True, exist_ok=True) so it is safe to
    # call on every startup even if the directory was already created previously.
    photo_dir = ensure_photo_dir()
    logger.info(
        "SmartHealth Hub API starting up",
        extra={
            "version": "0.1.0",
            "environment": "development",
            "media_dir": str(settings.MEDIA_DIR),
            "photo_dir": str(photo_dir),
        },
    )
    yield
    logger.info("SmartHealth Hub API shutting down")


# ---------------------------------------------------------------------------
# Application instance
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# OpenAPI tag metadata
# Each tag maps to one sub-router; descriptions appear in Swagger UI / ReDoc.
# ---------------------------------------------------------------------------
_OPENAPI_TAGS: list[dict[str, str]] = [
    {
        "name": "auth",
        "description": (
            "Authentication — login with password, issue/refresh JWT tokens, "
            "logout, and password-reset flow. "
            "Public endpoints: login, verify-otp, resend-otp, forgot-password."
        ),
    },
    {
        "name": "mfa",
        "description": (
            "Multi-Factor Authentication — enroll TOTP or SMS-OTP, verify MFA "
            "challenges, and manage MFA device status per user."
        ),
    },
    {
        "name": "patients",
        "description": (
            "Patient registration and demographic record management. "
            "Supports search, create, read, update, soft-delete, and profile photo "
            "upload (JPEG/PNG/WebP, max 5 MiB). "
            "All write operations emit audit log entries."
        ),
    },
    {
        "name": "medical-history",
        "description": (
            "Patient medical-history entries (conditions, allergies, surgical "
            "history). Notes are AES-256-GCM encrypted at the application layer "
            "before persisting to the database."
        ),
    },
    {
        "name": "immunizations",
        "description": (
            "Immunization records per patient — vaccine name, dose number, "
            "administration date, and the BHW who administered the dose."
        ),
    },
    {
        "name": "appointments",
        "description": (
            "Appointment scheduling, status updates, and cancellation. "
            "Triggers SMS reminders via Semaphore at the configured lead-time "
            "before the scheduled date."
        ),
    },
    {
        "name": "health-cards",
        "description": (
            "Hybrid NFC/QR health card generation, verification, and PDF "
            "rendering (WeasyPrint). Cards encode only ``patient_id`` + HMAC "
            "signature — no PHI is ever written to the card payload."
        ),
    },
    {
        "name": "analytics",
        "description": (
            "Aggregated real-time analytics: vaccination coverage rates, "
            "illness/diagnosis trends, appointment no-show rates, and "
            "demographic breakdowns for BHC reporting."
        ),
    },
    {
        "name": "sms",
        "description": (
            "SMS dispatch via Semaphore — manual send, delivery-status webhook "
            "(public), and SMS log query. The delivery-status webhook endpoint "
            "is unauthenticated."
        ),
    },
    {
        "name": "users",
        "description": (
            "User account management for BHC staff — create, list, update, "
            "deactivate, and role assignment. Admin-only except for the "
            "``GET /users/me`` self-service endpoint."
        ),
    },
    {
        "name": "audit",
        "description": (
            "Audit log query endpoints (read-only). Returns timestamped records "
            "of every create/update/delete/PHI-view action across all modules."
        ),
    },
    {
        "name": "health",
        "description": (
            "Service liveness and database connectivity probes used by "
            "container orchestrators and load balancers."
        ),
    },
]

app = FastAPI(
    title="SmartHealth Hub API",
    version="0.1.0",
    # Disable the built-in /docs so we can serve a custom one with the
    # responseInterceptor that auto-fills the Bearer token after verify-otp.
    docs_url=None,
    description=(
        "**SmartHealth Hub** — Integrated Health Care Information Management System "
        "for Barangay Health Centers (BHCs) in the Philippines.\n\n"
        "Provides REST endpoints for patient records, appointments, hybrid NFC/QR "
        "health cards, immunizations, analytics, MFA authentication, and SMS "
        "notifications via Semaphore.\n\n"
        "## Authentication\n"
        "Most endpoints require a **JWT Bearer token** obtained from `POST /api/v1/auth/login` "
        "followed by OTP verification at `POST /api/v1/auth/verify-otp`.\n\n"
        "Click the **Authorize** button and paste your access token (without the "
        "`Bearer ` prefix) to authenticate all subsequent requests in Swagger UI."
    ),
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    openapi_tags=_OPENAPI_TAGS,
    lifespan=lifespan,
    # Swagger UI configuration: persist auth between page reloads and show
    # request duration for performance awareness during development.
    swagger_ui_parameters={
        "persistAuthorization": True,
        "displayRequestDuration": True,
        "docExpansion": "none",
        "filter": True,
        "tryItOutEnabled": False,
        # Pre-fill the OAuth2 client_id so the Authorize dialog only needs
        # username, password, and client_secret (OTP).
        "initOAuth": {
            "clientId": "swagger-ui",
            "usePkceWithAuthorizationCodeGrant": False,
        },
    },
)


# ---------------------------------------------------------------------------
# OpenAPI schema customisation — JWT Bearer security scheme
# ---------------------------------------------------------------------------
# FastAPI generates the HTTPBearer security scheme automatically from the
# _bearer_scheme dependency declared in security.py, but it uses a generated
# key that may not render the "Authorize" button cleanly in all Swagger UI
# versions.  We override ``openapi()`` once to:
#   1. Cache the schema (same as FastAPI's built-in caching).
#   2. Ensure the scheme is named "bearerAuth" with bearerFormat "JWT" so
#      Swagger UI renders a single, clearly-labelled Authorize dialog.
#   3. Apply it as a global security requirement so every endpoint shows the
#      lock icon — individual public endpoints can override with ``security=[]``.


def _custom_openapi() -> dict:  # type: ignore[return]
    if app.openapi_schema:
        return app.openapi_schema  # type: ignore[return-value]

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        tags=_OPENAPI_TAGS,
    )

    # Inject security schemes into components.securitySchemes.
    schema.setdefault("components", {}).setdefault("securitySchemes", {})

    # 1. BearerAuth — manual token paste (fallback / non-Swagger clients).
    schema["components"]["securitySchemes"]["bearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": (
            "JWT access token obtained from POST /api/v1/auth/login + "
            "POST /api/v1/auth/verify-otp. Paste the raw token value here "
            "(Swagger UI adds the 'Bearer ' prefix automatically)."
        ),
    }

    # 2. swaggerOAuth2 — OAuth2 password grant pointing at the combined
    #    /auth/swagger-token endpoint so Swagger's Authorize dialog can
    #    fetch and store the token automatically.
    #    client_secret field = OTP code (documented in the endpoint description).
    schema["components"]["securitySchemes"]["swaggerOAuth2"] = {
        "type": "oauth2",
        "description": (
            "Use the Authorize dialog to log in without copy-pasting tokens. "
            "Enter your email as 'username', your password, and paste the "
            "6-digit OTP into **client_secret**."
        ),
        "flows": {
            "password": {
                "tokenUrl": "/api/v1/auth/swagger-token",
                "scopes": {},
            }
        },
    }

    # Apply bearerAuth as the global default — endpoints that are truly public
    # declare ``security=[]`` explicitly so they show an open-lock icon.
    schema.setdefault("security", [{"bearerAuth": []}, {"swaggerOAuth2": []}])

    app.openapi_schema = schema
    return app.openapi_schema  # type: ignore[return-value]


app.openapi = _custom_openapi  # type: ignore[method-assign]


# ---------------------------------------------------------------------------
# Custom /docs — Swagger UI with auto-authorization responseInterceptor
# ---------------------------------------------------------------------------
# FastAPI's built-in Swagger UI has no hook to auto-fill the Bearer token
# after a successful API call.  We serve our own /docs page that injects a
# responseInterceptor: when the /auth/verify-otp response contains an
# access_token, Swagger immediately calls preauthorizeApiKey() so the lock
# icon closes and every subsequent request carries the header automatically.
# ---------------------------------------------------------------------------

_SWAGGER_AUTO_AUTH_JS = """
<script>
  // Wait for the Swagger UI instance to be ready, then attach the interceptor.
  (function waitForUI() {
    if (typeof window.ui === 'undefined') {
      setTimeout(waitForUI, 100);
      return;
    }
    const originalResponseInterceptor = window.ui.getConfigs().responseInterceptor;
    window.ui.setConfigs({
      responseInterceptor: function(response) {
        if (
          response.url &&
          response.url.includes('/auth/verify-otp') &&
          response.status === 200 &&
          response.body &&
          response.body.access_token
        ) {
          const token = response.body.access_token;
          window.ui.preauthorizeApiKey('bearerAuth', token);
          console.info('[SmartHealth Hub] Bearer token auto-set from verify-otp response.');
        }
        return originalResponseInterceptor
          ? originalResponseInterceptor(response)
          : response;
      }
    });
  })();
</script>
"""


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui() -> HTMLResponse:
    """Swagger UI with responseInterceptor that auto-fills the Bearer token."""
    html = get_swagger_ui_html(
        openapi_url="/openapi.json",
        title="SmartHealth Hub API — Swagger UI",
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
        swagger_favicon_url="https://fastapi.tiangolo.com/img/favicon.png",
        init_oauth={"clientId": "swagger-ui"},
        swagger_ui_parameters={
            "persistAuthorization": True,
            "displayRequestDuration": True,
            "docExpansion": "none",
            "filter": True,
            "tryItOutEnabled": False,
        },
    )
    # Inject the auto-auth script just before </body>.
    patched = html.body.decode().replace("</body>", f"{_SWAGGER_AUTO_AUTH_JS}</body>")
    return HTMLResponse(content=patched, status_code=200)


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------


# CORS — restricted to trusted origins configured in .env.
# allow_credentials=True is required for httpOnly cookie-based auth (Phase 1).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


# Registers handlers for: AppError subclasses, Pydantic RequestValidationError,
# SQLAlchemy IntegrityError, and a catch-all Exception handler.
register_exception_handlers(app)


# ---------------------------------------------------------------------------
# API v1 router
# ---------------------------------------------------------------------------


app.include_router(api_router, prefix="/api/v1")


# ---------------------------------------------------------------------------
# Static files — /media
# ---------------------------------------------------------------------------
# Serves uploaded patient photos at /media/patient_photos/<uuid>.jpg.
#
# IMPORTANT: The /media mount is intentionally placed AFTER the API router.
# FastAPI checks routes in registration order; the API routes will match
# /api/v1/... paths before StaticFiles ever sees them.
#
# Access control note: StaticFiles does NOT enforce JWT auth — files under
# /media are publicly URL-addressable if the path is guessed.  This is
# acceptable for an internal BHC LAN deployment where the /media directory
# is not externally routable.  For production internet deployments, consider
# serving media files through the authenticated GET /patients/{id}/photo
# endpoint (which enforces JWT) and removing this static mount, or placing
# Nginx in front with its own auth check.
#
# The MEDIA_DIR is created on startup by the lifespan handler above.
# ``html=False`` disables directory listings for security.
settings.MEDIA_DIR.mkdir(parents=True, exist_ok=True)  # guard against startup race
app.mount(
    "/media",
    StaticFiles(directory=str(settings.MEDIA_DIR), html=False),
    name="media",
)


# ---------------------------------------------------------------------------
# Health check endpoints (public — no auth required)
# ---------------------------------------------------------------------------


@app.get("/health", tags=["health"], summary="Service liveness check")
async def health_check() -> dict[str, str]:
    """
    Returns 200 OK when the API process is running.

    Used by load balancers and container orchestrators to determine whether
    the process is alive and should receive traffic.
    """
    return {
        "status": "ok",
        "service": "smarthealth-hub-api",
        "version": "0.1.0",
    }


@app.get("/health/db", tags=["health"], summary="Database connectivity check")
async def health_db() -> dict[str, str]:
    """
    Attempts a lightweight ``SELECT 1`` query to verify that the API can
    reach the PostgreSQL database.

    Returns 200 OK with ``{"status": "ok", "database": "connected"}`` on
    success, or 503 Service Unavailable if the DB is unreachable.

    Note: this endpoint creates a short-lived session; it does NOT hold a
    connection open between calls.
    """
    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        logger.error(
            "Database health check failed",
            extra={"error": str(exc)},
        )
        raise HTTPException(
            status_code=503,
            detail=f"Database unavailable: {exc}",
        )
