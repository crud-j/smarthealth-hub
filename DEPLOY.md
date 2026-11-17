# Deploying SmartHealth Hub — Vercel + Linux server (Docker)

```
 Browsers / phones ──HTTPS──► Vercel  (Next.js frontend, https://<project>.vercel.app)
                                 │  proxies /api/v1/* and /media/*
                                 ▼
 NFC chip taps ────HTTPS──► Linux server  (https://api.<server-ip>.sslip.io)
 NFC relay / reader app ──►   ├─ Caddy      (HTTPS, automatic certificate)
                              ├─ FastAPI    (backend, runs migrations on start)
                              ├─ Celery worker + beat (SMS, PDFs, reminders, AI)
                              ├─ PostgreSQL 18
                              ├─ Redis 7
                              └─ media volume (patient photos, health-card PDFs)
```

Why the backend is not on Vercel: it needs always-on Celery workers, a shared
disk for photos/PDFs, and system libraries for PDF rendering (WeasyPrint) and
OCR (Tesseract). Vercel functions provide none of these.

---

## 0. What you need

- A Linux server (VPS): **Ubuntu 24.04, 2 GB RAM minimum** (4 GB is comfortable),
  ~25 GB disk. DigitalOcean, Hetzner, Vultr, AWS Lightsail, etc.
- A Vercel account connected to your GitHub repository.
- Your current `backend\.env` (you will copy secrets from it).
- No domain needed: the server gets `api.<ip-with-dashes>.sslip.io` and the
  frontend gets `<project>.vercel.app`.

Decide your Vercel project name now (e.g. `smarthealth-hub` →
`https://smarthealth-hub.vercel.app`); the backend config needs it.

---

## 1. Prepare the server

SSH in as root (or a sudo user):

```bash
# Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh

# Firewall: SSH + HTTP/HTTPS only. Postgres/Redis/FastAPI stay internal.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
```

Also open ports 22/80/443 in your provider's cloud firewall if it has one.

Get the code (for a private repo, add a read-only
[deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) first):

```bash
git clone git@github.com:<you>/<repo>.git /opt/smarthealth-hub
cd /opt/smarthealth-hub
```

---

## 2. Configure

```bash
cp .env.server.example .env.server
chmod 600 .env.server
nano .env.server
```

Fill in every `change-me`. The important ones:

| Setting | Value |
|---|---|
| `API_DOMAIN`, `NFC_VIEW_BASE_URL` | `api.<server-ip-with-dashes>.sslip.io` (NFC one with `https://`) |
| `QR_BASE_URL`, `WEBAUTHN_ORIGIN` | `https://<project>.vercel.app` |
| `WEBAUTHN_RP_ID` | `<project>.vercel.app` |
| `CORS_ORIGINS` | `["https://<project>.vercel.app"]` |
| `POSTGRES_PASSWORD` | output of `openssl rand -hex 24` |
| `ENCRYPTION_KEY` | **exactly** the value from your current `backend\.env` |
| `QR_HMAC_SECRET` | the value from your current `backend\.env` |
| `JWT_SECRET_KEY` | new: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `EMAIL_*`, SMS keys | copy from `backend\.env` |

> ⚠️ A different `ENCRYPTION_KEY` makes every encrypted diagnosis and
> treatment note unreadable. A different `QR_HMAC_SECRET` invalidates every
> printed QR code and signed NFC link.

Below, `dc` is shorthand for:

```bash
alias dc='docker compose -f docker-compose.server.yml --env-file .env.server'
```

---

## 3. Bring over your existing data (skip for a fresh start)

**On your Windows PC** (PowerShell), export the database and media. Your PC
runs PostgreSQL 18 and so does the server stack — keep them on the same major
version, or `pg_restore` will refuse the dump:

```powershell
cd C:\Users\githu\OneDrive\Documents\smarthealth-hub\backend
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h 127.0.0.1 -U <db-user> -d smarthealthhub -F c -f smarthealthhub.dump
scp smarthealthhub.dump root@<server-ip>:/tmp/
scp -r media root@<server-ip>:/tmp/media
```

`<db-user>` is the user in `DATABASE_URL` in your `backend\.env`.

**On the server**, restore into the database *before* the backend starts
(the backend would otherwise create empty tables first):

```bash
cd /opt/smarthealth-hub
dc up -d db
dc cp /tmp/smarthealthhub.dump db:/tmp/db.dump
dc exec db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl /tmp/db.dump'
```

---

## 4. Start the backend

```bash
dc up -d --build          # first build takes a few minutes
dc ps                     # all services should be "running" / "healthy"
dc logs -f backend        # watch migrations + startup; Ctrl+C to stop following
curl https://<API_DOMAIN>/health
# → {"status":"ok",...}
```

If you copied media in step 3:

```bash
dc cp /tmp/media/. backend:/app/media/
dc exec -u root backend chown -R appuser:appuser /app/media
```

Fresh start instead of a restore? Create the demo accounts:

```bash
dc exec backend python scripts/seed_db.py
```

---

## 5. Deploy the frontend on Vercel

1. Vercel → **Add New → Project** → import your GitHub repository.
2. **Root Directory:** `frontend/web` (Framework preset: Next.js — detected).
   Vercel detects pnpm from the repo's `pnpm-lock.yaml`.
3. **Environment Variables** (Production):

   | Name | Value |
   |---|---|
   | `SERVER_SIDE_API_URL` | `https://<API_DOMAIN>` |
   | `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` |

   Both are baked in at build time — **redeploy** after changing them.
4. Deploy, then open `https://<project>.vercel.app` and log in (the OTP
   arrives by email).

The browser only ever talks to `<project>.vercel.app`; Vercel forwards
`/api/v1/*` and `/media/*` to the server, so login cookies stay on the
Vercel domain and everything is HTTPS.

If you renamed the project or added a domain, update `QR_BASE_URL`,
`WEBAUTHN_*` and `CORS_ORIGINS` in `.env.server`, then `dc up -d`.

---

## 6. NFC in the cloud

**Chrome on Android (Scan with NFC button in the app)** — works as-is, and
better than on the LAN: Chrome only allows Web NFC on HTTPS pages.

**Chip links (tap a card → patient summary)** — chips now hold a *signed* link:
`https://<API_DOMAIN>/view/BHC-2026-000001?sig=…`. In production, unsigned or
tampered links are refused, so card numbers can't be guessed.
- **Rewrite every chip**: open the patient's health card print page and copy
  the URL under "NFC Tools Task URL", or use the nfc-batch export
  (`GET /api/v1/health-cards/nfc-batch`, admin only) for health drives.
- Old chips (`http://192.168.100.6:9000/view/…`) stop working once the LAN
  setup is retired.
- Lost/stolen card: its link keeps working until the card is reissued — report
  it and reissue.

**Android reader app / Wi-Fi relay (`scan-uid`)** — two options:
- Point the app straight at `https://<API_DOMAIN>/api/v1/health-cards/scan-uid`
  (no relay needed), **or**
- keep the relay on a clinic laptop and aim it at the server:
  ```powershell
  $env:SHH_API_URL = "https://<API_DOMAIN>"
  python backend\scripts\nfc_relay_server.py
  ```

**`/nfc-monitor`** — now requires a staff login
(`https://<project>.vercel.app/nfc-monitor`). It reads the last scan from
Redis, so it works with multiple API processes.

---

## 7. Updating

Manual:

```bash
cd /opt/smarthealth-hub
git pull
dc up -d --build          # migrations run automatically on backend start
```

Automatic: `.github/workflows/deploy.yml` runs the same commands over SSH
after CI passes on `main`. Add these repository secrets: `SSH_HOST`,
`SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_PORT`, plus the secrets its validation
step reads (`JWT_SECRET_KEY`, `ENCRYPTION_KEY`, SMS/email keys). Vercel
redeploys the frontend on every push by itself.

---

## 8. Backups (do this on day one)

Nightly database dump + media archive, keeping 14 days:

```bash
mkdir -p /opt/backups
cat > /etc/cron.daily/smarthealth-backup <<'EOF'
#!/bin/sh
set -e
cd /opt/smarthealth-hub
STAMP=$(date +%F)
docker compose -f docker-compose.server.yml --env-file .env.server exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c' > /opt/backups/db-$STAMP.dump
docker run --rm -v smarthealth_media:/media -v /opt/backups:/out alpine \
  tar czf /out/media-$STAMP.tar.gz -C /media .
find /opt/backups -type f -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/smarthealth-backup
```

Copy `/opt/backups` off the server regularly (your provider's snapshots or
`scp`). Keep a copy of `.env.server` somewhere safe — without
`ENCRYPTION_KEY` the backups' encrypted fields can't be read.

---

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| `curl https://<API_DOMAIN>` fails / certificate error | `dc logs caddy`. Ports 80+443 must be open. If Let's Encrypt rate-limits sslip.io, use a free [DuckDNS](https://www.duckdns.org) name instead. |
| Backend restarting | `dc logs backend` — usually a missing/invalid secret in `.env.server`. |
| Login says OK but bounces back to /login | Open the site via `https://<project>.vercel.app` (not a preview URL); check `SERVER_SIDE_API_URL` on Vercel and redeploy. |
| No OTP email | `dc logs backend` for SMTP errors; check the Gmail app password. |
| Passkey login fails | `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` must match the Vercel domain; passkeys from the LAN setup must be registered again. |
| Health-card PDF never finishes | `dc logs worker`. |
| NFC link shows "This card link is not valid" | Chip has an old or unsigned link — rewrite it from the print page. |

## Known limitations

- Audit logs and rate limits see Vercel's IP for browser traffic (not the
  user's), because requests reach the server through Vercel's proxy.
- Rate limits are counted per API process (`API_WORKERS`), so the effective
  limit is that many times higher.
- `/media` files (photos, PDFs) are served without a login check; their URLs
  contain random UUIDs, so they can't be guessed, but anyone holding a URL
  can open it.
