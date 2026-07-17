# SmartHealth Hub — Claude Code Context

## Project Identity

**SmartHealth Hub** — An Integrated Health Care Information Management System for Barangay Health Centers with NFC ID Card and SMS Notification Services (Thesis Project).

- **Stack:** Next.js 15 (App Router) · FastAPI · PostgreSQL · WeasyPrint · Semaphore SMS · JWT + MFA (OTP) · Hybrid NFC/QR Health Cards · Celery + Redis
- **System Development Plan:** [`docs/SmartHealth_Hub_System_Development_Plan.md`](docs/SmartHealth_Hub_System_Development_Plan.md) — this is the **authoritative source of truth** for folder structure, DB schema, API contracts, and feature scope. Read it before starting substantial work.

## Custom Agent

A specialized agent for this project is available: **`smarthealth-hub-architect`** (defined in `.claude/agents/smarthealth-hub-architect.md`).

Use it for all feature work — it has permanent knowledge of the thesis objectives, tech stack constraints, security rules (no PHI on NFC/QR), RBAC matrix, audit logging requirements, and the module boundaries defined in the System Development Plan.

To invoke it explicitly, use:
```
/agents smarthealth-hub-architect
```

Claude Code also uses this agent **proactively** for any SmartHealth Hub task involving:
- Patient registration and records
- Health card generation (QR/NFC/WeasyPrint PDF)
- SMS appointment/immunization reminders (Semaphore)
- MFA / JWT authentication flow
- Role-based access control (Admin, BHW, Physician/Nurse/Midwife, Admin Staff)
- Analytics dashboard and reports
- Database schema changes and Alembic migrations
- Audit logging

## Key Conventions (always apply)

- **Never put PHI on the NFC chip or in the QR payload** — cards encode only `patient_id` + `card_version` + HMAC signature.
- **Audit every write** — every CREATE/UPDATE/DELETE/PHI-VIEW on patient records writes an `audit_logs` row.
- **Pydantic v2** on all FastAPI request/response schemas; **TypeScript `strict: true`** on the frontend — no `any` without justification.
- **New DB changes ship as Alembic migrations** — never manual schema edits.
- **AES-256-GCM** application-layer encryption on `medical_history.notes`, `visits.diagnosis`, `visits.treatment_notes` before persisting.
- All endpoints (except `/auth/login`, `/auth/verify-otp`, `/auth/resend-otp`, `/auth/forgot-password`, `/sms/webhook/delivery-status`) require JWT auth + role check.
- Module boundaries: `app/services/` for business logic, `app/api/v1/endpoints/` for routes, `apps/web/app/(dashboard)/` for frontend pages — do not invent new top-level structure.

## Development Roadmap Phase (current reference)

See Section 12 of the System Development Plan for the 6-phase roadmap (Foundation → Patient Records → Health Cards → Appointments & SMS → Analytics → Hardening & UAT).
