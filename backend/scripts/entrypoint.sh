#!/bin/sh
# SmartHealth Hub backend container entrypoint.
#
# 1. Waits until PostgreSQL (from DATABASE_URL) accepts TCP connections.
# 2. Runs `alembic upgrade head` when RUN_MIGRATIONS=true (set it on the API
#    service only, so worker/beat don't race the migration).
# 3. Execs the container command (uvicorn by default, or celery worker/beat),
#    so signals (SIGTERM/SIGINT) reach the process directly.
set -e

echo "[entrypoint] Waiting for PostgreSQL..."
python - <<'PY'
import os
import socket
import sys
import time
from urllib.parse import urlsplit

url = urlsplit(os.environ.get("DATABASE_URL", ""))
host, port = url.hostname or "localhost", url.port or 5432
for attempt in range(1, 61):
    try:
        with socket.create_connection((host, port), timeout=2):
            print(f"[entrypoint] PostgreSQL is reachable at {host}:{port}.")
            sys.exit(0)
    except OSError:
        print(f"[entrypoint] Attempt {attempt}/60: {host}:{port} not ready, retrying in 2s...")
        time.sleep(2)
print(f"[entrypoint] ERROR: PostgreSQL at {host}:{port} never became reachable.")
sys.exit(1)
PY

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] Running database migrations..."
  alembic upgrade head
  echo "[entrypoint] Migrations complete."
fi

echo "[entrypoint] Starting: $*"
exec "$@"
