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
```

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

# Frontend only
pnpm --filter web test

# Backend only (from backend/)
cd backend && pytest tests --cov=app --cov-report=term-missing
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
