# SmartHealth Hub

**An Integrated Health Care Information Management System for Barangay Health Centers**
**with NFC ID Card and SMS Notification Services**

SmartHealth Hub is a thesis project and full-stack digital health management platform built for Barangay Health Centers (BHCs) in the Philippines. It replaces manual paper logbooks with a secure, networked system for patient registration, medical records, immunization tracking, appointment scheduling, hybrid NFC/QR health cards, automated SMS reminders, and real-time analytics.

---

## Key Features

- **Patient Registration** — Digital intake with OCR-assisted ID scanning, duplicate detection, auto-generated BHC patient codes, and senior/PWD/pregnant auto-flagging
- **Medical Records** — Encrypted clinical visits, diagnoses, treatment notes, and medical history (AES-256-GCM at the application layer)
- **Hybrid Health Cards** — PDF health cards with HMAC-signed QR codes and NFC chip support; no PHI on the card itself
- **Appointments & SMS Reminders** — Schedule visits and auto-send reminders via textbee, Semaphore, iTExmo, or PhilSMS
- **Immunization Tracking** — Per-patient immunization records with automated due-date SMS reminders
- **Analytics Dashboard** — Visit trends, illness frequency, vaccination coverage, no-show rates, CSV/JSON export, and optional AI-powered insights via OpenAI
- **Role-Based Access** — Four roles: Admin, BHW, Physician/Nurse/Midwife, Admin Staff
- **MFA Authentication** — Email OTP + optional FIDO2/WebAuthn passkey login
- **Audit Log** — Immutable, tamper-proof event trail on every patient data action

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (App Router) · TypeScript strict · Tailwind CSS v4 · React 19 |
| Backend | FastAPI · Python 3.12+ · SQLAlchemy 2.0 async · Pydantic v2 |
| Database | PostgreSQL 16 · Alembic migrations |
| Task Queue | Celery 5 + Redis (SMS dispatch, scheduled reminders) |
| PDF Generation | WeasyPrint + Jinja2 HTML templates |
| Authentication | JWT (httpOnly cookies) · Argon2id · Email OTP · FIDO2/WebAuthn passkey |
| SMS Providers | textbee (recommended) · Semaphore · iTExmo · PhilSMS |
| Encryption | AES-256-GCM on all PHI text fields |
| Containerization | Docker + Docker Compose |

---

## Prerequisites

| Tool | Minimum Version | Notes |
|------|----------------|-------|
| Python | 3.12+ | `python --version` to check |
| Node.js | 20 LTS+ | `node --version` to check |
| Docker Desktop | 4.x+ | Required for PostgreSQL + Redis |
| npm | 9+ | Comes with Node.js |

---

## Quick Start

### 1. Clone the repository

```bash
git clone <repository-url> smarthealth-hub
cd smarthealth-hub
```

### 2. Set up the Python virtual environment

```bash
cd backend
python -m venv .venv

# Windows (PowerShell):
.venv\Scripts\activate

# macOS / Linux:
source .venv/bin/activate

pip install -e ".[dev]"
cd ..
```

### 3. Configure environment variables

```bash
# Windows (PowerShell):
Copy-Item backend\.env.example backend\.env

# macOS / Linux:
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in the required values — at minimum:
- `JWT_SECRET_KEY` — generate with `python -c "import secrets; print(secrets.token_hex(32))"`
- `QR_HMAC_SECRET` — generate the same way (use a different value)
- `ENCRYPTION_KEY` — generate with `python -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"`
- `EMAIL_HOST_USER` + `EMAIL_HOST_PASSWORD` — Gmail address + App Password for OTP emails

See [`docs/CLIENT_HANDOVER.md`](docs/CLIENT_HANDOVER.md) for a full explanation of every variable.

### 4. Start the database and Redis

```bash
docker compose -f infra/docker-compose.yml up db redis -d
```

This starts PostgreSQL on port `5445` and Redis on port `6380` as background services.

### 5. Run database migrations

```bash
cd backend
alembic upgrade head
```

Creates all 21 tables. Run once on first setup, and again after pulling new code that includes migrations.

### 6. (Optional) Seed demo data

```bash
cd backend
python scripts/seed_db.py
```

Creates two demo staff accounts and sample patient records for testing:

| Role | Email | Password |
|------|-------|----------|
| Admin | `e2e-admin@bhc.local` | `E2eAdmin!2026` |
| BHW | `e2e-bhw@bhc.local` | `E2eBhw!2026` |

### 7. Start the development servers

Open **separate terminal windows** for each service, in this order:

**Terminal 1 — FastAPI Backend** (port 8000)
```bash
cd backend
.venv\Scripts\activate        # Windows
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Celery Worker** (background tasks: SMS, PDF generation)
```bash
cd backend
.venv\Scripts\activate        # Windows

# Windows (required — no fork support):
celery -A app.workers.celery_app worker --loglevel=info -P solo

# macOS / Linux:
# celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
```

**Terminal 3 — Celery Beat** (scheduled reminders)
```bash
cd backend
.venv\Scripts\activate        # Windows
celery -A app.workers.celery_app beat --loglevel=info --schedule=/tmp/celerybeat-schedule
```

**Terminal 4 — Next.js Frontend** (port 3000)
```bash
cd frontend/web
npm install       # first run only
npm run dev
```

The application will be available at **http://localhost:3000**.
The API documentation (Swagger UI) is at **http://localhost:8000/docs**.

---

## NFC Demo Setup

The NFC relay bridges an Android phone's NFC reader to the backend over Wi-Fi.

**Start the relay server** (port 9000):
```bash
cd backend
.venv\Scripts\activate
python scripts/nfc_relay_server.py
```

**Open Windows Firewall for port 9000** (run once as Administrator):
```powershell
New-NetFirewallRule `
  -DisplayName "SmartHealth NFC Relay (9000)" `
  -Direction Inbound -Protocol TCP `
  -LocalPort 9000 -Action Allow -Profile Private
```

See [`docs/NFC_WiFi_Relay_Setup.md`](docs/NFC_WiFi_Relay_Setup.md) for the full NFC setup guide, including how to link a patient to an NFC chip and how to use the HTTP Shortcuts Android app as the NFC reader.

---

## Cloudflare Tunnel (QR codes from phones)

QR codes embed your `QR_BASE_URL`. For QR scanning to work from a phone that is not on the same LAN, use a Cloudflare Quick Tunnel to expose localhost publicly over HTTPS:

```bash
cloudflared tunnel --url http://localhost:3000
```

Copy the generated URL (e.g. `https://xxxx.trycloudflare.com`) and update `backend/.env`:
```env
QR_BASE_URL=https://xxxx.trycloudflare.com
WEBAUTHN_ORIGIN=https://xxxx.trycloudflare.com
WEBAUTHN_RP_ID=xxxx.trycloudflare.com
```

Then restart the backend and regenerate any health cards.

> No Cloudflare account is required for a temporary Quick Tunnel. The URL changes each time you restart the tunnel.

---

## Docker Compose (full stack)

To run everything in Docker (database, Redis, backend, Celery worker, Celery beat, and frontend):

```bash
# First run (builds images):
docker compose up --build

# Subsequent runs:
docker compose up

# Background (detached):
docker compose up -d

# View logs:
docker compose logs -f

# Stop (keeps data):
docker compose down
```

Run migrations inside the container after first start:
```bash
docker compose exec backend alembic upgrade head
```

---

## Running Tests

```bash
# Full backend test suite with coverage:
cd backend
pytest tests --cov=app --cov-report=term-missing

# Intake form tests only (fast, ~5 seconds):
cd backend
pytest tests/test_intake_submission.py -v

# Frontend E2E tests (Playwright):
cd frontend/web
npx playwright test
```

---

## Project Structure

```
smarthealth-hub/
├── backend/                    # FastAPI application
│   ├── app/
│   │   ├── api/v1/endpoints/   # Route handlers (thin — no DB queries)
│   │   ├── services/           # All business logic and DB queries
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic v2 request/response schemas
│   │   ├── core/               # Config, security (JWT/AES), exceptions
│   │   ├── workers/            # Celery app + scheduled tasks
│   │   └── templates/          # Jinja2 HTML for WeasyPrint PDF
│   ├── alembic/versions/       # 21 database migrations (0001–0021)
│   ├── scripts/                # Seed, backup, restore, NFC relay, SMS test
│   └── tests/                  # pytest test suite
├── frontend/web/               # Next.js application
│   ├── app/(dashboard)/        # All auth-gated pages (App Router)
│   ├── components/             # Shared UI components
│   ├── hooks/                  # Data-fetching and state hooks
│   └── types/                  # TypeScript type definitions
├── infra/
│   ├── docker-compose.yml      # Legacy compose (infrastructure-only use)
│   └── docker/                 # Dockerfiles
├── docker-compose.yml          # Canonical root compose (all services)
├── docker-compose.override.yml # Dev overrides (hot-reload bind mounts)
└── docs/                       # Architecture, guides, and runbooks
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture, data flows, security decisions |
| [`docs/USER_FLOWS.md`](docs/USER_FLOWS.md) | Step-by-step explanation of every user flow |
| [`docs/CLIENT_HANDOVER.md`](docs/CLIENT_HANDOVER.md) | Full setup and handover guide for new operators |
| [`docs/DEMO_RUNBOOK.md`](docs/DEMO_RUNBOOK.md) | All terminal commands needed to run a demo |
| [`docs/NFC_WiFi_Relay_Setup.md`](docs/NFC_WiFi_Relay_Setup.md) | NFC relay setup and Android app configuration |
| [`docs/database.md`](docs/database.md) | Database schema reference |
| [`docs/api-reference.md`](docs/api-reference.md) | API endpoint reference |
| [`docs/SmartHealth_Hub_System_Development_Plan.md`](docs/SmartHealth_Hub_System_Development_Plan.md) | Authoritative system design, DB schema, API contracts |

---

## Key URLs (when running locally)

| URL | Description |
|-----|-------------|
| http://localhost:3000 | Web application |
| http://localhost:8000/docs | Swagger UI — interactive API documentation |
| http://localhost:8000/health | Backend health check |
| http://localhost:9000/status | NFC relay health check |
