# SmartHealth Hub

**An Integrated Health Care Information Management System for Barangay Health Centers with NFC ID Card and SMS Notification Services**

This monorepo contains the full-stack implementation of the SmartHealth Hub thesis project — a digital health management platform for Barangay Health Centers (BHCs) in the Philippines.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | >= 20 |
| pnpm | >= 9 |
| Python | >= 3.12 |
| Docker & Docker Compose | >= 24 |

---

## Quick Start

### 1. Install dependencies

```bash
# Install all JS/TS workspace dependencies
pnpm install

# Set up Python virtual environment for the backend
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate
pip install -e ".[dev]"
cd ..
```

### 2. Configure environment variables

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your secrets

# Frontend
cp frontend/web/.env.local.example frontend/web/.env.local
# Edit frontend/web/.env.local if needed
```

### 3. Start infrastructure (Postgres + Redis)

```bash
docker-compose -f infra/docker-compose.yml up db redis -d


### Postgresql

┌──────────────┬─────────────────────────────────────────┐
│   Command    │              What it does               │
├──────────────┼─────────────────────────────────────────┤
│ \dt          │ List all tables                         │
├──────────────┼─────────────────────────────────────────┤
│ \d tablename │ Show columns/schema of a specific table │
├──────────────┼─────────────────────────────────────────┤
│ \dn          │ List schemas                            │
├──────────────┼─────────────────────────────────────────┤
│ \du          │ List users/roles                        │
├──────────────┼─────────────────────────────────────────┤
│ \l           │ List all databases                      │
├──────────────┼─────────────────────────────────────────┤
│ \q           │ Quit psql                               │
└──────────────┴─────────────────────────────────────────┘

`Quick example — view all patients:
`SELECT patient_code, first_name, last_name, is_active FROM patients ORDER BY created_at DESC LIMIT 10;`

`View all health cards:`
`SELECT card_number, status, generation_status, issued_at FROM health_cards ORDER BY issued_at DESC;`


Host:     localhost
Port:     5445
Database: smarthealthhub
User:     shh_admin
Password: SmartHealthHub

### Start cloudflare.


```bash
cloudflared tunnel --url http://localhost:3000
```
`unknownusers8273827@gmail.com`

### start windows celery

```bash
celery -A app.workers.celery_app worker --loglevel=info -P solo
celery -A app.workers.celery_app beat --loglevel=info
```

### start nfc
`python backend/scripts/nfc_relay_server.py`

### 4. Run database migrations

```bash
turbo db:migrate
# or directly:
cd backend && alembic upgrade head
```

### 5. Run development servers

```bash
# Start all services concurrently via Turborepo
turbo dev

# Or individually:
# Frontend (Next.js on http://localhost:3000)
cd frontend/web && pnpm dev

# Backend (FastAPI on http://localhost:8000)
cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## Run Tests

```bash
# All workspaces
turbo test

#NFC Testing
python backend/scripts/nfc_relay_server.py


# Frontend only
pnpm --filter web test

# Backend only (from backend/)
cd backend && pytest tests --cov=app --cov-report=term-missing
```

### Backend intake tests (fast, isolated)

```bash
# Run intake form submission tests (10 tests, ~5 seconds)
cd backend
pytest tests/test_intake_submission.py -v
```

### Seed real test data into dev database (visible in frontend)

```bash
# Seeds 3 intake tokens + 3 intake applications into the dev DB
# Run while the backend dev server is running
cd backend
python -m tests.seed_intake_test_data
```

After seeding, open these URLs in the browser:

| Token | URL |
|---|---|
| Token 1 (full draft) | http://localhost:3000/intake/aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa |
| Token 2 (partial) | http://localhost:3000/intake/bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb |
| Token 3 (fresh) | http://localhost:3000/intake/cccccccc-3333-3333-3333-cccccccccccc |

View seeded applications in the dashboard:
- `/registrations` — Pre-visit Drafts tab (tokens 1 & 2)
- `/settings/intake-applications` — Online Applications (all 3 applications)

### Full backend test suite with coverage

```bash
cd backend
pytest tests --cov=app --cov-report=term-missing
```

---

## Docker Compose (full stack)

```bash
# Start all services
docker-compose -f infra/docker-compose.yml up --build

# Start only infrastructure
docker-compose -f infra/docker-compose.yml up db redis -d
```

---

## Project Structure

```
smarthealth-hub/
├── frontend/
│   └── web/                  # Next.js 15 frontend (App Router)
├── backend/                  # FastAPI backend
│   ├── app/                  # Python package
│   │   ├── api/v1/           # Route handlers
│   │   ├── core/             # Config, security, logging
│   │   ├── db/               # SQLAlchemy session & base
│   │   ├── models/           # ORM models
│   │   ├── schemas/          # Pydantic v2 schemas
│   │   ├── services/         # Business logic
│   │   ├── workers/          # Celery tasks
│   │   └── utils/            # Shared utilities
│   ├── alembic/              # DB migrations
│   └── tests/                # Pytest test suite
├── packages/
│   └── shared-types/         # Shared TypeScript interfaces
├── infra/
│   ├── docker/               # Dockerfiles
│   ├── docker-compose.yml    # Local dev compose
│   └── nginx/                # Nginx reverse proxy config
├── docs/                     # System Development Plan & docs
└── scripts/                  # Utility scripts
```

---

## Key Technologies

- **Frontend:** React 19 + Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS v4
- **Backend:** FastAPI + SQLAlchemy 2.0 (async) + Alembic + PostgreSQL
- **Auth:** JWT (access + refresh) + SMS OTP MFA via Semaphore
- **Health Cards:** WeasyPrint PDF + QR Code (HMAC-signed) + NFC (patient ID pointer only)
- **Background Jobs:** Celery + Redis
- **SMS:** Semaphore API

---

## Documentation

See [`docs/SmartHealth_Hub_System_Development_Plan.md`](docs/SmartHealth_Hub_System_Development_Plan.md) for the authoritative system design, DB schema, and API contracts.
