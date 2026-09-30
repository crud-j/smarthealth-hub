#!/bin/sh
set -e

# Wait for PostgreSQL to accept connections
MAX_ATTEMPTS=30
ATTEMPT=0

echo "[entrypoint] Waiting for PostgreSQL..."
until pg_isready -q 2>/dev/null; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    echo "[entrypoint] ERROR: PostgreSQL did not become ready after ${MAX_ATTEMPTS} attempts. Aborting."
    exit 1
  fi
  echo "[entrypoint] Attempt ${ATTEMPT}/${MAX_ATTEMPTS} — retrying in 2s..."
  sleep 2
done

echo "[entrypoint] PostgreSQL is ready."

# Run Alembic migrations — exit immediately if migration fails
echo "[entrypoint] Running database migrations..."
alembic upgrade head
echo "[entrypoint] Migrations complete."

# Replace shell with uvicorn so signals (SIGTERM, SIGINT) are forwarded correctly
echo "[entrypoint] Starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
