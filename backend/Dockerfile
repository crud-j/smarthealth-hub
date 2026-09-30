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
FROM python:3.12-slim AS builder

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
FROM python:3.12-slim AS runtime

# Same WeasyPrint system libraries needed at *runtime* (not just build time).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    fontconfig \
    fonts-liberation \
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

# Create the media directory the app writes to and make it writable.
RUN mkdir -p /app/media/patient_photos && chown -R appuser:appuser /app

# Ensure the venv's bin/ is first on PATH so `python` / `uvicorn` resolve there.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER appuser

EXPOSE 8000

# Copy the entrypoint script that runs migrations before starting uvicorn.
COPY scripts/ /app/scripts/
RUN chmod +x /app/scripts/entrypoint.sh

# Run migrations then hand off to uvicorn.
# exec in entrypoint.sh ensures SIGTERM/SIGINT reach uvicorn directly.
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
