# ─────────────────────────────────────────────────────────────────────────────
# SmartHealth Hub — Backend Dockerfile
# Multi-stage build: builder installs deps into a venv; runtime copies only
# what is needed so the final image stays lean and runs as a non-root user.
#
# WeasyPrint PDF generation requires several system libraries (Pango, Cairo,
# GDK-Pixbuf) that must be present in both stages.
#
# Usage (from project root):
#   docker build -f backend/Dockerfile -t smarthealth-backend backend/
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Pinned to Debian bookworm: package names below (e.g. libgdk-pixbuf2.0-0)
# differ on newer Debian releases that the unpinned -slim tag may move to.
FROM python:3.12-slim-bookworm AS builder

# System libraries needed to *compile* some wheels (e.g. argon2-cffi) and to
# run WeasyPrint's PDF rendering at both build and run time.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libcairo2-dev \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    libssl-dev \
    fontconfig \
    fonts-liberation \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast, reproducible virtual-environment creation.
RUN pip install --no-cache-dir uv==0.4.30

WORKDIR /app

# Copy only the dependency manifest first so Docker can cache this layer.
COPY pyproject.toml ./

# Create a virtual environment under /app/.venv and install all runtime deps.
# uv sync respects requires-python and resolves the lock in one pass.
RUN uv venv /app/.venv && \
    uv pip install --python /app/.venv/bin/python --no-cache -e "."

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS runtime

# Same WeasyPrint system libraries needed at *runtime* (not just build time),
# plus Tesseract with English + Filipino language data for ID-card OCR
# (app/services/ocr_service.py uses lang="eng+fil").
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    fontconfig \
    fonts-liberation \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-fil \
    && rm -rf /var/lib/apt/lists/*

# Non-root user — all files owned by appuser for least-privilege operation.
RUN groupadd --system appuser && useradd --system --gid appuser --shell /bin/sh appuser

WORKDIR /app

# Copy the pre-built virtual environment from the builder stage.
COPY --from=builder /app/.venv /app/.venv

# Copy application source (only what's needed — see .dockerignore).
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY pyproject.toml ./
COPY scripts ./scripts

# Media directory (patient photos + generated health-card PDFs) — mount a
# volume here in production so files survive container rebuilds.
# Strip Windows line endings from the entrypoint in case the repo was checked
# out with CRLF, and make it executable — both BEFORE switching user.
RUN mkdir -p /app/media/patient_photos /app/media/health_cards \
    && sed -i 's/\r$//' /app/scripts/entrypoint.sh \
    && chmod +x /app/scripts/entrypoint.sh \
    && chown -R appuser:appuser /app

# Ensure the venv's bin/ is first on PATH so `python` / `uvicorn` resolve there.
# XDG_CACHE_HOME: appuser has no home directory, so give fontconfig (used by
# WeasyPrint for PDFs) a writable cache location.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MEDIA_DIR=/app/media \
    XDG_CACHE_HOME=/tmp/.cache

USER appuser

# Short git commit of the source, shown on the System Health page. Passed by
# scripts/deploy.sh (via docker-compose.server.yml build args). Declared this
# late so a new commit only invalidates this last layer, not the cached ones.
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}

EXPOSE 8000

# The entrypoint waits for PostgreSQL, runs migrations when RUN_MIGRATIONS=true,
# then execs the command — so the same image serves the API (default CMD),
# the Celery worker and Celery beat (compose overrides `command:`).
ENTRYPOINT ["/app/scripts/entrypoint.sh"]

# WEB_CONCURRENCY sets the number of uvicorn worker processes (default 1).
# --proxy-headers + --forwarded-allow-ips: trust X-Forwarded-* from the
# reverse proxy (Caddy) in front of the container.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*", "--no-server-header"]
