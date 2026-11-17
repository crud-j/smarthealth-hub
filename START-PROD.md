# SmartHealth Hub — Production Mode on Windows (no Docker)

Runs the same services as [START.md](START.md), but optimized for real use:
compiled frontend, multiple API workers, no auto-reload, production security
settings. Docker is **not** required.

## One command

PostgreSQL must be running. Redis is started in WSL automatically if needed.

```powershell
cd C:\Users\githu\OneDrive\Documents\smarthealth-hub
.\start-prod.ps1
```

This will:

1. Check PostgreSQL and Redis are reachable.
2. Validate secrets with `ENVIRONMENT=production` (refuses to start with default keys).
3. Run `alembic upgrade head`.
4. Build the frontend (`npm run build:prod`).
5. Open four windows: **API**, **Celery worker**, **Celery beat**, **Web**.

Options:

| Flag | Effect |
|------|--------|
| `-SkipBuild` | Reuse the last frontend build (faster restarts) |
| `-SkipMigrate` | Don't run database migrations |
| `-ApiWorkers 2` | Number of uvicorn worker processes (default 4) |
| `-ApiHost 127.0.0.1` | Don't expose port 8000 on the LAN (breaks the NFC relay redirect) |

To stop: close the four windows (or press Ctrl+C in each).

> `ENVIRONMENT=production` is set only for the processes this script starts.
> `backend\.env` can stay on `development` for normal dev work.

---

## Manual steps (what the script does)

### Backend (FastAPI) — no build step

```powershell
cd C:\Users\githu\OneDrive\Documents\smarthealth-hub\backend
$env:ENVIRONMENT = "production"
python scripts/validate_secrets.py --strict
python -m alembic upgrade head
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 --proxy-headers
```

Celery worker and beat: same commands as START.md, in windows where
`$env:ENVIRONMENT = "production"` is set.

### Frontend (Next.js)

```powershell
cd C:\Users\githu\OneDrive\Documents\smarthealth-hub\frontend\web
npm run build:prod    # next build + copies static assets into the standalone server
npm run start:prod    # serves on http://0.0.0.0:3000
```

`build:prod` sets `NEXT_PUBLIC_API_BASE_URL=/api/v1`, so **every browser
request goes through port 3000**. Next.js proxies `/api/v1/*` and `/media/*` to
FastAPI at `SERVER_SIDE_API_URL` (from `.env.local`, default
`http://localhost:8000`). The LAN IP in `.env.local` is only used by
`npm run dev`.

Rebuild the frontend after changing frontend code or `SERVER_SIDE_API_URL`.
Restart the backend after changing `backend\.env`.

---

## What changes in production mode

| | Development | Production |
|---|---|---|
| Auth cookies | sent over HTTP | **HTTPS only** (plus `localhost`) |
| OTP | also stored for the dev OTP helper | **email only** — Gmail SMTP must work |
| Secrets | warnings | **startup fails** on default JWT/QR/encryption keys |
| Frontend | `next dev`, hot reload | compiled, minified, cached |
| API | 1 process, `--reload` | 4 worker processes |

**Accessing from phones or other PCs:** because cookies are HTTPS-only,
`http://192.168.x.x:3000` will show the login page but login won't stick. Use
the Cloudflare tunnel (`.\start-tunnel.ps1`) and set `WEBAUTHN_ORIGIN` /
`WEBAUTHN_RP_ID` to the tunnel URL as described in START.md.

## Quick health checks

| URL | Expect |
|-----|--------|
| http://localhost:3000/api/health | 200 (frontend) |
| http://localhost:8000/health | `{"status":"ok"}` (backend) |
| http://localhost:3000/login | login page |
