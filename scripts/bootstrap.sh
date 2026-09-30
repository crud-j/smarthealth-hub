#!/bin/sh
set -e

# ANSI color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { printf "${GREEN}  ✓ %s${NC}\n" "$1"; }
warn() { printf "${YELLOW}  ⚠ %s${NC}\n" "$1"; }
err()  { printf "${RED}  ✗ %s${NC}\n" "$1" >&2; }
step() { printf "\n${BOLD}[%s] %s${NC}\n" "$1" "$2"; }

echo ""
printf "${BOLD}SmartHealth Hub — Developer Bootstrap${NC}\n"
echo "================================================"

# ── Step 1: Check required tools ──────────────────────────────────────────────
step "1/8" "Checking required tools..."
MISSING=0
for TOOL in docker node npm; do
  if ! command -v "$TOOL" >/dev/null 2>&1; then
    err "Required tool not found: $TOOL"
    MISSING=1
  else
    ok "$TOOL found"
  fi
done
# Check docker compose (V2 plugin)
if ! docker compose version >/dev/null 2>&1; then
  err "docker compose (V2) is required but not found. Install Docker Desktop >= 4.x"
  MISSING=1
else
  ok "docker compose found"
fi
if [ "$MISSING" -eq 1 ]; then
  err "Install the missing tools above and re-run this script."
  exit 1
fi

# ── Step 2: Copy .env if missing ──────────────────────────────────────────────
step "2/8" "Checking environment configuration..."
if [ ! -f "backend/.env" ]; then
  cp backend/.env.example backend/.env
  warn "backend/.env was created from .env.example"
  warn "IMPORTANT: Edit backend/.env and fill in real values before running in production."
  warn "Required: ENCRYPTION_KEY, JWT_SECRET_KEY, SEMAPHORE_API_KEY (or alternative SMS key)"
else
  ok "backend/.env already exists"
fi

# ── Step 3: Start database and Redis first ────────────────────────────────────
step "3/8" "Starting PostgreSQL and Redis..."
docker compose up -d db redis
ok "db and redis containers started"

# ── Step 4: Wait for PostgreSQL ───────────────────────────────────────────────
step "4/8" "Waiting for PostgreSQL to accept connections..."
MAX=30
ATTEMPT=0
until docker compose exec -T db pg_isready -q 2>/dev/null; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge "$MAX" ]; then
    err "PostgreSQL did not become ready after ${MAX} attempts. Check docker compose logs db"
    exit 1
  fi
  printf "  Attempt %d/%d — waiting 2s...\r" "$ATTEMPT" "$MAX"
  sleep 2
done
ok "PostgreSQL is ready"

# ── Step 5: Run migrations ────────────────────────────────────────────────────
step "5/8" "Running database migrations (alembic upgrade head)..."
docker compose run --rm backend alembic upgrade head
ok "Migrations complete"

# ── Step 6: Seed data (if seed script exists) ─────────────────────────────────
# NOTE: The primary seed script is backend/scripts/seed_db.py.
# For a full reset + rich seed (60 patients, visits, appointments, immunizations),
# use backend/scripts/reset_and_seed.py instead.
step "6/8" "Seeding development data..."
SEED_SCRIPT="backend/scripts/seed_db.py"
if [ -f "$SEED_SCRIPT" ]; then
  docker compose run --rm backend python scripts/seed_db.py
  ok "Seed data loaded"
else
  warn "No seed script found at ${SEED_SCRIPT} — skipping"
fi

# ── Step 7: Start all services ────────────────────────────────────────────────
step "7/8" "Starting all services..."
docker compose up -d
ok "All services started"

# ── Step 8: Install frontend dependencies ─────────────────────────────────────
step "8/8" "Installing frontend npm dependencies..."
(cd frontend/web && npm install)
ok "Frontend dependencies installed"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "================================================"
printf "${GREEN}${BOLD}  Bootstrap complete!${NC}\n"
echo "================================================"
printf "  Backend API : ${BOLD}http://localhost:8000${NC}\n"
printf "  API Docs    : ${BOLD}http://localhost:8000/docs${NC}\n"
printf "  Frontend    : ${BOLD}http://localhost:3000${NC}\n"
printf "  Celery      : ${BOLD}docker compose logs -f celery${NC}\n"
echo ""
printf "${YELLOW}  Next: Start the frontend dev server:${NC}\n"
printf "    cd frontend/web && npm run dev\n"
echo ""
