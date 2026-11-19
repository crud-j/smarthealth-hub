# Phase 9 (System Health page) is DONE and live, secrets rotated after a leak; next is Phase 10, admin role model B

**Date:** 2026-11-19
**Status:** COMPLETED (Phase 9). Phase 10 not started; 3 user decisions needed before coding.
**Bead(s):** none (`bd` CLI not installed on this PC)
**Epic:** Deploy SmartHealth Hub to production and harden it (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `4`
**Parent:** `HANDOFF_nfc-backups-done_2026-11-19.md`
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > `HANDOFF_nfc-backups-done_2026-11-19.md` > this

> ⚠️ This repo is **PUBLIC**. This file deliberately contains no passwords, keys,
> email addresses, phone numbers, TextBee device IDs, NFC signatures or chip serial
> numbers. Never add them.

---

## Since Last Handoff

- **Parent step 1 (housekeeping)**: DONE. `feat/daily-backups` deleted (was `7da784c`). The two `.claude/worktrees/agent-*` worktrees **removed** after their uncommitted passkey drafts were exported to patches in `C:\Users\githu\worktree-backup\` (user approved via "go, all defaults"). `shh-backuptest` Docker cleanup still NOT done (Docker Desktop was not running).
- **Parent step 2 (Phase 9)**: DONE, merged as **PR #22** (merge `93a00a1`, commits `d7a5360` + `cc64c05`), deployed, and verified by the user's screenshot: **all 8 cards green**.
- **Parent open question "mark-missed at 23:00"**: answered. Moved to **18:00**, not the parent's proposed 22:00 (reason: the job texts patients; 22:00 = SMS at 10 PM).
- **Parent open question "reports 09:00 vs 17:00"**: answered. Moved to **Fri 17:00 / 17:15** (the email text already said "17:00 PHT"; 09:00 was skipped whenever the VM was started late).
- **Not in the parent**: immunization reminders moved **08:00 → 10:00** (exact-day query, so a late VM start meant that day's patients were *never* reminded).
- **Parent open question "deployed-commit display"**: answered. `GIT_COMMIT` build arg **plus `scripts/deploy.sh`**, so it can't be forgotten.
- **Parent open question "worktrees keep/remove"**: answered, removed (with patch backup).
- **Parent open question "retention test fake file"**: still unanswered (harmless; check with `ls -l /var/backups/smarthealth` some time).
- **New incident**: the user screenshotted the **entire `.env.server`** into the chat. `JWT_SECRET_KEY` and `QR_HMAC_SECRET` were rotated (twice: the first new values were also pasted). The TextBee key was replaced and the old one revoked. `POSTGRES_PASSWORD` and `ENCRYPTION_KEY` were deliberately **not** rotated (see Key Decisions).
- **Trajectory**: on path. Phase 10 is next. The user wants to start it in a fresh session.

## Reference Documents

- `DEV-WORKFLOW.md` (repo root): day-to-day process. **Changed this session**: §6 now deploys with `bash /opt/smarthealth-hub/scripts/deploy.sh`; §9 has a **scheduled jobs table**; §11 has 2 new troubleshooting rows (System Health red cards) and a rollback line that sets `GIT_COMMIT`.
- `DEPLOY.md`: first-time setup (unchanged this session).
- `CLAUDE.md`: project conventions (no PHI on NFC/QR, audit every write, Alembic for schema, AES-256-GCM on encrypted columns).
- `plans/handoffs/HANDOFF_azure-go-live_2026-11-18.md` (grandparent): **Post-Close Additions §C** is the Phase 10 change list (admin model B). **Read §C before starting Phase 10.** All its file:line anchors were re-verified this session (table in Code Analysis below).
- `plans/handoffs/HANDOFF_nfc-backups-done_2026-11-19.md` (parent): backup service design, celery schedule history.
- Claude memory: `deployment_setup.md` (updated with Phase 9 + rotation), **new** `feedback_no_secret_screens.md`, `pnpm_not_npm.md`, `project_scaffold.md`.

## The Goal

SmartHealth Hub (thesis project: Barangay Health Center records system with NFC/QR health cards, SMS reminders, OTP MFA) runs in production. The website is `https://smarthealth-hub-two.vercel.app` (Vercel) and the API is `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose). The roadmap hardens it for real use and the thesis defense: Phase 7 NFC ✅, Phase 8 backups ✅, Phase 9 System Health ✅, **Phase 10 admin role model B (next)**. Model B: the admin keeps system administration and non-clinical patient work, but can no longer read decrypted clinical PHI (diagnoses, treatment notes, medical-history notes) or make clinical edits.

## Where We Are

- **Production**: server repo `/opt/smarthealth-hub` on `main` at **`93a00a1`**. The backend container env has `GIT_COMMIT=93a00a1` (verified via `docker inspect`). All **7 services** are healthy after `dc up -d --wait`: backend, worker, beat, caddy, db, redis, backup.
- **System Health page live** at Settings → System Health (also in the sidebar under Administration, admin only). User screenshot at 17:58 Manila: banner "All systems working". Backups OK "Last good: 3 h ago" (Nov 19 2:54 PM, database 114 KB, media 3.0 MB, "Runs daily 22:30 Asia/Manila, keeps 14 days"). Background jobs OK "Last signal 11 s ago". Database OK 11 MB. Redis OK. Disk OK 19 GB free, 31.6% used of 28 GB. Media OK 3.0 MB, 61 files. Admin alerts OK "Configured". Version OK `93a00a1`, production.
- **The heartbeat being fresh proves the new beat schedule is loaded**: the `system-heartbeat` entry exists only in the new `celery_app.py`. The new job times (10:00/18:00/21:00/21:30/Fri 17:00) are therefore active. None of them has been observed firing yet.
- **Backend endpoint**: `GET /api/v1/system/status` (`backend/app/api/v1/endpoints/system_config.py`, `get_system_status`, `AdminOnly` + `DbDep`). Logic is in `backend/app/services/system_status_service.py` (`collect_system_status`).
- **Heartbeat task**: `monitoring.heartbeat` in `backend/app/workers/monitoring_tasks.py` writes Redis key `system:heartbeat` (ISO UTC time) with TTL 180 s, `ignore_result=True`. The beat entry `system-heartbeat` runs every minute with `options={"expires": 50}`.
- **`/health/db`** (`backend/app/main.py`) now returns 503 `"Database unavailable"` (raised `from None`); the exception goes only to the log.
- **Deploy script** `scripts/deploy.sh` exists on `main` and on the server. The user ran it once (first deploy, via `git pull && bash scripts/deploy.sh`).
- **`.env.server` on the server changed this session** (values never shown to Claude after the rotation): new `JWT_SECRET_KEY`, new `QR_HMAC_SECRET`, new `TEXTBEE_API_KEY`, new `TEXTBEE_DEVICE_ID`, `ADMIN_ALERT_PHONE` set. Mode is still 600. The backup copy `~/env.server.bak-*` was **deleted** by the user.
- **Bitwarden** note "SmartHealth Hub .env.server" updated by the user with all 5 changed values ("saved"; key, device ID and phone confirmed).
- **Old TextBee API key revoked** by the user. The new key + device ID are proven by a test SMS: `SMS OK, status: queued`.
- **SMS does not actually go out yet**: the gateway phone showed the test message as **failed**. The user believes the SIM has no load. Until it's loaded, every reminder SMS fails at the carrier, and the system **cannot see that** (TextBee reports `queued`).
- **All QR/NFC links signed before the rotation now return 403**: the user's school-ID chip (card `SH-2026-000001`) and any printed demo card QR codes. The chip has **not** been rewritten yet.
- **Everyone was logged out** by the JWT rotation. The user has logged in again (the screenshot proves it).
- **PC repo**: currently on branch `feat/system-health` (merged; can be deleted). `main` locally is at `76cef79`, behind `origin/main` (`93a00a1`). Uncommitted: `README.md` (**the user's own edit**: an `ssh azureuser@…` line added inside the "Terminal 1" code block around line 134; not session work, don't commit it without asking), plus the usual never-commit files (`backend/celerybeat-schedule-shm/-wal`, `START.md`, `dump.rdb`, `start-tunnel.ps1`).
- **A pre-existing git stash** exists: `stash@{0}: WIP on main: d041507 feat(dashboard): add error boundary and loading states for dashboard components`. Not from this chain. Don't drop it without asking.
- **Local test DB**: `smarthealthhub_test` does **not** exist on the PC's Postgres 18, and the dev DB user **cannot CREATE DATABASE** (`InsufficientPrivilegeError`). DB-backed pytest can't run locally unless Docker Desktop runs (DEV-WORKFLOW §5 containers) or the DB is created as a superuser. CI ran them green on PR #22.
- **The PC disk is 89% full** (seen by the status smoke test, `used_percent: 89.0`). Not urgent, but worth telling the user again if builds start failing.
- **Claude can SSH to the server read-only** (`ssh -o BatchMode=yes azureuser@smarthealth-hub.japaneast.cloudapp.azure.com '...'` works with the PC key). **Changing `.env.server` over SSH was denied** by the Claude Code auto-mode classifier ("Destructive or Unwanted Actions"). Expect the same for other production writes: give the user commands instead.

## What We Tried (Chronological)

1. **Onboarding (read-only)**: `bd` not installed. Read the parent handoff, grandparent §B, `system_config.py`, `celery_app.py`, `main.py:505-554`, `docker-compose.server.yml`, `settings/audit-log/page.tsx`. Adjacent: `monitoring_tasks.py` (sync Redis pattern), `security.py:95 get_shared_redis()` (async pool, `decode_responses=True`, 2 s socket timeouts), `conftest.py` (`admin_token`/`bhw_token`, no Redis fake), `Sidebar.tsx:180-186` (Administration group), `backend/Dockerfile` (no build args). Live `/health` OK.
2. **The user asked for recommendations that "solve a real problem"**. Investigated before answering:
   - `reminder_scheduler._mark_missed_appointments_async` marks `pending/confirmed` with `scheduled_at < now()`, so the status part catches up after a missed day. The follow-up SMS step selects `status == "missed" AND date(scheduled_at) == today (UTC)` with **no "already sent" check**, so running it hourly would double-text. Conclusion: once daily, 18:00.
   - `report_tasks.py` email text says "every Friday at 17:00 PHT", but beat timezone is Asia/Manila, so it actually fired at 09:00 Manila. A late VM start skips it. Conclusion: 17:00/17:15.
   - `dispatch_immunization_reminders` docstring: `next_due_date == today + SMS_IMMUNIZATION_LEAD_DAYS` (exact day). A skipped day is never retried. Conclusion: 10:00.
   - Worktrees: base `d041507` is in `origin/main`. Both had uncommitted passkey work dated 2026-07-25. Passkey is already on `main` (`0011_passkey_credentials.py`, `passkey_service.py`); the worktree files differ (older drafts) except `frontend/web/lib/passkey.ts` (identical). Conclusion: remove after a patch backup.
   - `GIT_COMMIT`: the real problem is `git pull && dc up -d` without `--build` silently runs old code. Conclusion: build arg + deploy script.
3. **User replied "."**: treated as not a go signal, and asked again. Then the user asked "what should I do on VM?": explained the question was about their daily start time, nothing to do on the VM. Then **"go, all defaults"** (immunization at 10:00; the user should start the VM before 10:00).
4. **Housekeeping**: `git -C <worktree> add -A` + `diff --cached --binary` → `C:\Users\githu\worktree-backup\agent-ab03ee5752556336d.patch` (31,477 bytes, 6 files) and `agent-ae1dce47461ea86a8.patch` (53,197 bytes, 13 files). `git worktree remove --force` ×2, `git branch -D` of both worktree branches, `git branch -d feat/daily-backups`. `main` fast-forwarded to `76cef79` (PR #21 had been merged), then `git checkout -b feat/system-health`.
5. **Backend implementation**: config fields, heartbeat task, beat schedule, schemas, service, endpoint, `/health/db` fix, Dockerfile ARG, compose build arg + read-only backup mount, `scripts/deploy.sh`, `.env.server.example` notes. Worker-module docstrings were updated with `sed`. `git diff --stat` confirmed only the intended lines changed (no CRLF churn).
6. **Local pytest attempt 1**: every test errored with `asyncpg.exceptions.InvalidCatalogNameError`, including the existing `tests/test_health.py`, because `smarthealthhub_test` doesn't exist.
7. **Docker check**: `docker info` → `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified` (Docker Desktop not running).
8. **Tried creating the test DB** with the dev credentials (script read `backend/.env` via settings, printed nothing secret): `server version: 18`, then `InsufficientPrivilegeError: permission denied to create database`. Abandoned. Nothing was created.
9. **DB-free tests via `--noconftest`**: needs `ENCRYPTION_KEY` in env (used the conftest's test key `c21hcnRoZWFsdGhodWJ0ZXN0IWtleTMyYnl0ZXMhISE=`, which is public in conftest.py). The first `-k` filter matched 2 fixture-needing tests (errors); the refined `-k "(rules or backup_ or heartbeat_task) and not test_status_"` gave **14 passed, 9 deselected**. A JSON traceback in the output is the expected `logger.exception` from the unreadable-file test.
10. **Smoke test of `collect_system_status`** with a stub DB (`scalar_one() → 12_345_678`) against the PC's real settings: route registered `True`. Local Redis was not running → `redis.status=error` after the 2 s connect timeout (no crash), workers `unknown`, disk `warning` (89.0%), media ok (28 files), backup `unknown` (dev), alerts `warning`, version `unknown`.
11. **Frontend lint**: the first version used a `useCallback` `load()` called in `useEffect` → `react-hooks/set-state-in-effect` warning. Moving `setRefreshing(true)` out of `load` **still warned** (the rule follows the callback). Final: the fetch is defined **inside** the effect with a `cancelled` flag (same pattern as `settings/page.tsx`), and the Refresh button bumps `refreshKey` → **0 warnings**.
12. **CI failure on PR #22 (mypy)**: `app/services/system_status_service.py:215: error: Argument 1 to "classify_heartbeat" has incompatible type "bytes | str | None"; expected "str | None" [arg-type]`. Cause: CI installs the newest redis-py (**8.1.0**), whose `get()` is typed `bytes | str | None`. Fix: `cast("str | None", await r.get(HEARTBEAT_KEY))` (commit `cc64c05`). Verified locally by `pip install --target <scratchpad>/newredis redis` + `PYTHONPATH=… mypy`: a probe file without the cast reproduces the CI error exactly, and `app` passes with the fix. Then CI was green and the user merged.
13. **Deploy**: the user ran `cd /opt/smarthealth-hub && git pull && bash scripts/deploy.sh` (output not pasted). Claude verified read-only over SSH: `branch: main @ 93a00a1`, `GIT_COMMIT=93a00a1`, backend `Up 42 minutes (healthy)`, worker/beat `Up 41 minutes`, backup `Up 2 hours`, caddy `Up 29 hours`, db/redis `Up 30 hours (healthy)`.
14. **Secret leak**: Step 4 told the user to `nano .env.server` to set the phone, and the user sent a **screenshot of the whole file**. Claude stopped, listed the exposure, and saved memory `feedback_no_secret_screens.md`. It assessed rotation per secret (table in Evidence) and verified that QR rotation needs no DB change: `qr_payload_hash` is **written but never read**, and verification always recomputes the HMAC (`qr_service.verify_qr_payload`, `nfc_payload_service`).
15. **The user asked Claude to do the rotation itself**: the SSH `sed` on `.env.server` was **denied by the auto-mode classifier**. Claude did not work around it and gave commands instead. Round 1: `changed lines (want 2): 2`, `mode (want 600): 600`, `dc up -d --wait` all 7 Healthy. **But the user pasted the Bitwarden `grep` output (the new values).** Round 2: rotated again (`valid lines (want 2): 2`, all Healthy). For Bitwarden, a separate step with "don't paste, run `clear`, reply 'saved'" worked.
16. **Admin phone** via `read -r -p` + `sed`: `phone set (want 1): 1`, all Healthy. The user asked whether to edit the `read` line itself; it was explained that you type the number at the prompt.
17. **TextBee**: the new key via hidden `read -r -s -p`: `key set (want 1): 1`. The multi-line Python test paste was **cut off** (bash `>` continuation) → replaced with a one-liner. Result `SMSPermanentError: textbee rejected the request (HTTP 404): Device not found. Check TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID in .env.` → the new key belongs to an account where the device has a different ID → the user set the new `TEXTBEE_DEVICE_ID` (`device set (want 1): 1`) → `SMS OK, status: queued`. The phone showed the message as **failed** (likely no load). The old key was revoked.
18. **Cleanup**: deleted the two screenshot copies in the Claude temp `images` folder (`1.png` 124,070 bytes with the secrets; `2.png` 67,327 bytes).

## Key Decisions

- **Endpoint lives in `system_config.py`** (same `/system` router + `AdminOnly`) with the logic in a new `services/system_status_service.py` (codebase pattern: thin endpoint, service module). Rejected: a new endpoint module (unnecessary).
- **Every check is independent and never raises**. A dead dependency is reported as `status="error"` in its own section, and raw exception text goes only to the log. Why: the page must still work when one dependency is down, and messages can leak hosts/users/paths.
- **Thresholds live in the backend** (single source of truth); the frontend only renders. Values: heartbeat warn > 150 s (key TTL 180 s ⇒ missing = error), disk warn ≥ 80% / error ≥ 90%, backup warn > 26 h / error > 50 h, failed attempt after a recent success ⇒ warning.
- **`unknown` doesn't affect the overall status**: in dev the backup check is `unknown`; in production a missing `status.json` is an `error`.
- **Admin alert phone reported as configured yes/no only**. Missing = warning, because SMS-failure alerts would otherwise go nowhere.
- **Heartbeat = one combined "worker + beat" signal**, with `expires=50` so a recovering worker doesn't replay stale heartbeats. Rejected: `celery_app.control.ping()` (blocking, slow) and separate beat/worker signals (not needed).
- **Backup status via a read-only bind mount into backend only** (`${BACKUP_HOST_DIR:-/var/backups/smarthealth}:/backups:ro`), relying on Phase 8's 711 folder / 644 `status.json` / 600 dumps. The backend (`appuser`) can open `status.json` by name but can't list or read dumps.
- **`GIT_COMMIT` as a Dockerfile `ARG` declared last** (after `USER appuser`), so a new commit only invalidates the final layer. **Never put `GIT_COMMIT` in `.env.server`**: `env_file` would override the baked value at runtime. Rejected: mounting `.git` (shows what's on disk, not what's built, which defeats the purpose).
- **`scripts/deploy.sh` calls `docker compose` with full flags** (the `dc` alias lives in `~/.bashrc` and doesn't exist in scripts), uses `git pull --ff-only`, asks before deploying a non-`main` branch, and uses `up -d --build --wait --wait-timeout 300` so it prints OK/FAILED. It's invoked as `bash scripts/deploy.sh` to avoid the Windows exec-bit problem. **Rollback must NOT use the script** (it would pull the bad code again); DEV-WORKFLOW §11 has the manual `GIT_COMMIT=… dc up -d --build` line.
- **Job times (user: "go, all defaults")**: immunization 10:00, mark-missed 18:00, AI 21:00/21:30, reports Fri 17:00/17:15, heartbeat every minute. Rationale for every daily job: the VM runs ~10:00–23:00 and Celery Beat never catches up.
- **Secret rotation scope**: rotated `JWT_SECRET_KEY` (token forgery; cost = everyone logs out), `QR_HMAC_SECRET` (forged NFC/QR links for any card = the Phase 7 protection; cost = rewrite 1 chip), and the TextBee key (SMS from the user's account). **Not rotated**: `POSTGRES_PASSWORD` (DB not internet-reachable; changing it is risky because the volume keeps the old password) and `ENCRYPTION_KEY` (needs re-encryption tooling; useless without a DB copy). Both remain in this chat's history. A proper rotation can be planned later.
- **New values are generated on the server** (`openssl rand -hex 32` inside `sed`) and verified with counts/regexes, never displayed. The user does the Bitwarden copy in a separate step with an explicit "don't paste".

## Evidence & Data

### Commit log (this session)
| Hash | Branch | Summary |
|---|---|---|
| `76cef79` | main | Merge PR #21 (docs/handoff-phase9: the parent handoff) |
| `d7a5360` | feat/system-health | feat(system): System Health admin page + job times that survive the nightly shutdown |
| `cc64c05` | feat/system-health | fix(system): cast Redis heartbeat value for newer redis-py typing |
| `93a00a1` | main | Merge PR #22 (feat/system-health): **deployed on the server** |

### Celery beat schedule after this session (`backend/app/workers/celery_app.py`, Asia/Manila)
| Entry | Task | Before | After | Why |
|---|---|---|---|---|
| system-heartbeat (new) | monitoring.heartbeat | — | every minute, `expires=50` | System Health liveness |
| dispatch-appointment-reminders | reminders.dispatch_appointment_reminders | hourly :00 | same | — |
| dispatch-immunization-reminders | reminders.dispatch_immunization_reminders | 08:00 | **10:00** | exact-day query; late VM start = never reminded |
| run-ai-risk-scoring | ai_tasks.run_risk_scoring | 01:00 | **21:00** | VM off 23:00–morning (user decision in parent) |
| run-ai-anomaly-detection | ai_tasks.run_anomaly_detection | 01:30 | **21:30** | same |
| check-sms-failure-rate | monitoring.check_sms_failure_rate | hourly :30 | same | — |
| audit-scan-anomalies | audit.scan_anomalies | hourly :30 | same | — |
| send-weekly-report | reports.send_weekly | Fri 09:00 | **Fri 17:00** | matches the email text; VM surely on |
| send-monthly-report | reports.send_monthly | Fri 09:15 (days 22–31) | **Fri 17:15** | same |
| mark-missed-appointments-daily | workers.mark_missed_appointments | 23:00 (`nowfun=manila_now`) | **18:00** | raced the shutdown; no night SMS; once daily (no SMS dedupe) |
| (backup container, not Celery) | infra/backup/backup.sh | 22:30 | same | catch-up after start |

### Secret exposure + rotation matrix
| Secret | Exposed in chat? | Risk if known | Action | Verified |
|---|---|---|---|---|
| `JWT_SECRET_KEY` | yes (screenshot), then the 1st new value pasted | forge any login token | rotated **twice** | `valid lines 2`, all Healthy |
| `QR_HMAC_SECRET` | yes, then the 1st new value pasted | forge NFC/QR links for any card | rotated **twice** | same |
| `TEXTBEE_API_KEY` | yes (screenshot) | send SMS from the account | new key + old **revoked** | `key set 1`, `SMS OK, status: queued` |
| `TEXTBEE_DEVICE_ID` | yes (screenshot) | low alone | changed (new key's account had a different device) | `device set 1` |
| `POSTGRES_PASSWORD` | yes (screenshot) | DB not reachable from internet | **not rotated** (deliberate) | — |
| `ENCRYPTION_KEY` | yes (screenshot) | decrypt notes *with* a DB copy | **not rotated** (needs re-encryption tool) | — |
| `ADMIN_ALERT_PHONE` | no (never shown) | — | set | `phone set 1` |

### System Health response shape (`SystemStatusResponse`, `backend/app/schemas/system_config.py`)
```text
overall: ok|warning|error|unknown        checked_at: datetime
version:  {commit, environment}
database: {status, message, size_bytes}
redis:    {status, message}
workers:  {status, message, last_heartbeat_at, age_seconds}
disk:     {status, message, total_bytes, free_bytes, used_percent}
media:    {status, message, size_bytes, file_count}
backup:   {status, message, last_success_at, age_hours, last_attempt_at, db_bytes, media_bytes, schedule, keep_days}
alerts:   {status, message, admin_alert_phone_configured}
```

### Production System Health (user screenshot, Nov 19 17:58 Manila)
| Card | Status | Value |
|---|---|---|
| Backups | OK | Last good 3 h ago (Nov 19 2:54 PM), database 114 KB, media 3.0 MB, daily 22:30, keep 14 days |
| Background jobs | OK | Last signal 11 s ago |
| Database | OK | 11 MB |
| Redis | OK | Connected |
| Disk | OK | 19 GB free, 31.6% used of 28 GB |
| Media files | OK | 3.0 MB, 61 files |
| Admin alerts | OK | Configured |
| Version | OK | `93a00a1`, production |

### Local verification results (PC)
| Check | Result |
|---|---|
| `ruff check app tests/test_system_status.py` | All checks passed |
| `ruff format --check` | 113 files formatted (test file was reformatted once) |
| `mypy app --ignore-missing-imports` (local redis) | Success, 112 files |
| same with redis **8.1.0** on PYTHONPATH | Success after the cast; probe without cast reproduces the CI error |
| pytest DB-free subset (`--noconftest`) | **14 passed**, 9 deselected |
| pytest full file / `test_health.py` | ERROR: `InvalidCatalogNameError` (no local test DB) |
| frontend `tsc --noEmit` | exit 0 |
| `eslint` on 3 changed files | 0 problems (after the effect refactor) |
| `pnpm run lint` whole app | 0 errors, 83 warnings (pre-existing) |
| `pnpm run test` (vitest) | 12 passed (12) |
| compose YAML parse | backend volumes `[media:/app/media, …:/backups:ro]`, worker volumes unchanged |
| `bash -n scripts/deploy.sh` | syntax ok |
| CI on PR #22 | first run: mypy fail (above); after `cc64c05`: green (user merged) |

### Smoke test of `collect_system_status` on the PC (stub DB, real local env)
```text
route registered: True
overall   error
database  ok   Connected.
redis     error  Cannot reach Redis. Logins, OTP codes and background jobs need it.   (local Redis not running; 2 s timeout)
workers   unknown  Cannot check while Redis is down.
disk      warning  used_percent 89.0
media     ok   file_count 28
backup    unknown  Backups run only on the server.
alerts    warning  Not set: …
version   commit unknown
```

### Server command log (as `azureuser`, in `/opt/smarthealth-hub`; all worked)
```bash
git pull && bash scripts/deploy.sh                                   # first deploy of 93a00a1
# rotation round 1 (backup kept, then deleted)
B=$HOME/env.server.bak-$(date +%Y%m%d-%H%M%S); cp -p .env.server "$B"; chmod 600 "$B"
for K in JWT_SECRET_KEY QR_HMAC_SECRET; do sed -i "s/^$K=.*/$K=$(openssl rand -hex 32)/" .env.server; done
GIT_COMMIT=$(git rev-parse --short HEAD) dc up -d --wait
rm "$B"
# rotation round 2: same for-loop + grep -cE '^(JWT_SECRET_KEY|QR_HMAC_SECRET)=[0-9a-f]{64}$' (=2) + up --wait
# admin phone:   read -r -p "Admin phone (+639...): " P ; sed -i "s/^ADMIN_ALERT_PHONE=.*/ADMIN_ALERT_PHONE=$P/" .env.server
# textbee key:   read -r -s -p "New TextBee API key (hidden): " K; echo; sed -i "s|^TEXTBEE_API_KEY=.*|TEXTBEE_API_KEY=$K|" .env.server; unset K
# device id:     read -r -p "TextBee device ID: " D ; sed -i "s|^TEXTBEE_DEVICE_ID=.*|TEXTBEE_DEVICE_ID=$D|" .env.server
# SMS test (one line; prints only OK/error class):
dc exec -T backend python -c "import asyncio; from app.core.config import settings as s; from app.services.sms_service import SMSService as S; r = asyncio.run(S().send_sms(s.ADMIN_ALERT_PHONE, 'SmartHealth Hub: test SMS, new TextBee key works.')); print('SMS OK, status:', r.get('status'))" 2>&1 | tail -1
```
Every change was followed by `GIT_COMMIT=$(git rev-parse --short HEAD) dc up -d --wait`. This keeps the version label even without a rebuild; plain `dc up -d` also works for env-only changes.

### Consolidated failed approaches (don't repeat)
| Attempt | Error / outcome | Lesson |
|---|---|---|
| Local pytest without a test DB | `InvalidCatalogNameError` on every test | need `smarthealthhub_test`; dev user can't create it |
| `CREATE DATABASE` with dev creds | `InsufficientPrivilegeError` | ask the user (superuser) or use Docker §5 containers |
| `-k "rules or backup_ or heartbeat_task"` | matched 2 endpoint tests that need fixtures | exclude `test_status_` |
| `useCallback` load + effect | `react-hooks/set-state-in-effect` warning | define the fetch inside the effect + `cancelled` flag + refresh counter |
| `r.get()` passed straight to a `str \| None` param | CI mypy fail with redis-py 8.1.0 | `cast("str \| None", …)` (same as monitoring_tasks) |
| Telling the user to `nano .env.server` | whole file screenshotted into chat | one-key `read`/`sed` commands only |
| Bitwarden `grep` in the same block as pasteable output | new secrets pasted into chat | separate step: "don't paste, `clear`, reply 'saved'" |
| Claude editing `.env.server` over SSH | denied by the auto-mode classifier | user runs production writes; Claude may SSH read-only |
| Multi-line `python -c "…"` pasted into SSH | paste cut off, bash `>` prompt | one-liners for the user's server commands |
| New TextBee key, old device ID | HTTP 404 "Device not found" | key and device ID go together (per account) |

### Timeline (user prompt → outcome)
| # | User said | Outcome |
|---|---|---|
| 1 | read seq-3 handoff, onboard, wait | read-only onboarding; plan + 5 questions |
| 2 | "I have merge it … tell me first what's best … ensure it solves a real problem" | code-backed recommendations (18:00, 17:00, 10:00, remove worktrees, deploy script); noted PR #21 not yet visible on the remote |
| 3 | "." | asked for an explicit go + VM start time |
| 4 | "what should i do on VM?" | explained: only their start-time habit; default 10:00 |
| 5 | "go, all defaults" | housekeeping + full Phase 9 implementation + local checks + commit/PR files |
| 6 | CI mypy error pasted | cast fix, verified against redis 8.1.0, push commands |
| 7 | "merged" | verified `93a00a1` on origin/main; server steps 1–4 |
| 8 | screenshot of nano on `.env.server` (all secrets) | stopped; exposure + rotation table; memory saved |
| 9 | "can you do it instead?" | read-only SSH verify OK; `.env.server` write denied by classifier; commands given |
| 10 | rotation round 1 output **incl. new secrets** | asked for round 2, Bitwarden as a separate no-paste step |
| 11 | round 2 output | verified `/health` + `/health/db` 200 from outside |
| 12 | "saved" | admin phone one-liner |
| 13 | "should i put my number? read -r -p …" | explained interactive prompt |
| 14 | phone set 1 | TextBee key rotation steps + SMS test |
| 15 | paste cut at `>` | one-line SMS test |
| 16 | HTTP 404 Device not found | device ID update steps |
| 17 | `SMS OK, status: queued` | revoke old key, Bitwarden, screenshot, chip |
| 18 | "arrived but highlighted as failed … no balance" | carrier failure explained; revoke now, load SIM |
| 19 | "I revoked it … updated Bitwarden … right?" | confirmed 5-value checklist + last-4-chars compare |
| 20 | System Health screenshot (all green) | Phase 9 closed; 3 Phase 10 decisions listed |
| 21 | "delete them, then /handoff … give me the prompt" | screenshots deleted; this file |

## Code Analysis

- **`system_status_service.py` constants**: `HEARTBEAT_WARN_SECONDS = 150`, `DISK_WARN_PERCENT = 80.0`, `DISK_ERROR_PERCENT = 90.0`, `BACKUP_WARN_HOURS = 26.0`, `BACKUP_ERROR_HOURS = 50.0`, `_MAX_MESSAGE_CHARS = 300`, `_SEVERITY = {"unknown":0,"ok":0,"warning":1,"error":2}`.
- **Pure functions (unit-tested)**: `classify_heartbeat(raw, now) -> WorkerCheck`, `classify_disk(total, free) -> DiskCheck`, `classify_backup(data, now) -> BackupCheck`, `overall_status(list[CheckStatus])`. **I/O checks**: `check_database(db)` (`SELECT pg_database_size(current_database())`), `check_redis_and_workers(now)` (`get_shared_redis()`, `ping`, `get(HEARTBEAT_KEY)`), `check_disk(path)` (`shutil.disk_usage`), `check_media(path)` (`os.walk`), `check_backup(path, now)` (FileNotFoundError → error in production / unknown elsewhere), `check_alerts()`. `collect_system_status(db)` runs Redis + 3 thread-bound file checks via `asyncio.gather` + `asyncio.to_thread`, then the DB check.
- **Config** (`backend/app/core/config.py`, new block after `ADMIN_ALERT_PHONE`): `GIT_COMMIT: str = "unknown"`, `BACKUP_STATUS_FILE: pathlib.Path = Path("/backups/status.json")`.
- **Heartbeat constants** (`monitoring_tasks.py`): `HEARTBEAT_KEY = "system:heartbeat"`, `HEARTBEAT_TTL_SECONDS = 180`. The service imports them from the worker module (endpoints already import worker modules at load time, e.g. `sms.py:48`).
- **QR/NFC signing facts (checked for rotation safety)**: `qr_service._compute_hmac(patient_id, card_version)` = HMAC-SHA256 with `QR_HMAC_SECRET`. `verify_qr_payload` recomputes and `compare_digest`s. `health_cards.qr_payload_hash` = SHA-256 of the signed URL, **written** in `card_generation_service.py:157/195/308` but **never read** (an empty string only marks registration placeholders, `registration_tasks.py:250`). NFC: `nfc_payload_service.py:73` HMAC with an `"nfc-view:"` prefix.
- **SMS service**: `SMSService().send_sms(mobile_number, message) -> dict` (`{"message_id", "status"}`), raising `SMSTransientError` / `SMSPermanentError(status_code, body)`. `send_sms_sync()` swallows errors (logs only); don't use it for tests. TextBee `queued` = accepted by TextBee, **not** delivered by the carrier.
- **`/sms/send-manual`** (`sms.py:133`) sends only to a **patient's** number (`patient_id`, `message`, `send_now`); no "send to arbitrary number" endpoint exists.
- **Phase 10 anchors re-verified this session** (all still match grandparent §C):

| File:line | Current code | Model B change (§C) |
|---|---|---|
| `backend/app/api/v1/endpoints/medical_history.py:51` | `_CLINICAL = require_role("physician", "bhw", "admin")`, used at `:95` (POST visits) | drop `"admin"` |
| `medical_history.py:53` | `_PHI_READ = require_role("physician", "admin")`, used at `:137`, `:172`, `:251` | `("physician",)` |
| `medical_history.py:326` | `include_notes: bool = current_user.role.name in ("physician", "admin")` | `("physician",)` |
| `backend/app/api/v1/endpoints/immunizations.py:54` | `_PHYSICIAN_PLUS = require_role("physician", "admin")`, used at `:221` | **user decision** |
| `backend/app/api/v1/endpoints/patients.py:541` | `require_role("admin", "physician")` (archive list) | probably keep |
| `patients.py:127-129` | decrypts `allergies` / `known_conditions` for all roles | **user decision** |
| `backend/app/services/visit_service.py` | decrypts diagnosis/treatment (`decrypt_text`, import `:40`) via `_PHI_READ` routes | covered by the role change |
| `frontend/web/components/modals/VisitEditModal.tsx:53` | `canSeePhi = physician \|\| admin` | physician only |
| `frontend/web/app/(dashboard)/patients/[patientId]/history/page.tsx:88` | `canEdit = physician \|\| admin` | physician only |
| `…/[patientId]/immunizations/page.tsx:198` | `canDelete = physician \|\| admin` | follow the immunization decision |
| `…/[patientId]/page.tsx:211` | `isAdmin` gates `:304` (`patient.isActive`) and `:314` (`!patient.archivedAt`), likely archive/deactivate buttons | review; probably keep |
| `backend/tests/test_medical_history.py`, `test_visits.py` | use admin on clinical endpoints | update + add admin-403 tests |

- **`require_role` usage across `backend/app/api`** (count per signature): `("admin")` ×10, `("bhw","physician","admin_staff","admin")` ×4, `("admin","bhw")` ×4, `("physician","admin")` ×2, `("admin","bhw","physician","admin_staff")` ×2, plus singles: `()`, `("physician","bhw","admin")`, `("bhw","physician","admin","admin_staff")`, `("bhw","admin_staff","admin")`, `("admin","physician")`, `("admin","bhw","physician")`, `("admin","admin_staff")`. Only the clinical ones in the table above change under model B.

## Files Changed

### Source code (PR #22)
- `backend/app/api/v1/endpoints/system_config.py`: docstring lists 3 routes; new `GET /system/status` → `collect_system_status(db)`; imports `DbDep`, `SystemStatusResponse`.
- `backend/app/services/system_status_service.py`: **new** (~300 lines); all checks + classification.
- `backend/app/schemas/system_config.py`: `CheckStatus` Literal; `_Check`, `DatabaseCheck`, `RedisCheck`, `WorkerCheck`, `DiskCheck`, `MediaCheck`, `BackupCheck`, `AlertsCheck`, `VersionInfo`, `SystemStatusResponse`.
- `backend/app/core/config.py`: `GIT_COMMIT`, `BACKUP_STATUS_FILE`.
- `backend/app/workers/monitoring_tasks.py`: `heartbeat` task + constants; module docstring.
- `backend/app/workers/celery_app.py`: header comment explaining the shutdown rule; new times; heartbeat entry; fixed the UTC comments.
- `backend/app/workers/ai_tasks.py`, `reminder_scheduler.py`, `report_tasks.py`: docstrings now state the new times (the `report_tasks` email text "17:00 PHT" is now true).
- `backend/app/main.py`: `/health/db` 503 detail = `"Database unavailable"`, `from None`.
- `frontend/web/app/(dashboard)/settings/system-health/page.tsx`: **new**; 8 cards, banner, refresh every 60 s + button, 403 message, keeps the last result on refresh errors, Manila time formatting.
- `frontend/web/app/(dashboard)/settings/page.tsx`: third link card "System Health" + `IconActivity`.
- `frontend/web/components/layout/Sidebar.tsx`: `IconActivity`; Administration item `/settings/system-health` (`roles: ["admin"]`).

### Tests
- `backend/tests/test_system_status.py`: **new**; 401 no login, 403 bhw, all-OK (phone never in the response), Redis down (no exception text), no heartbeat, missing backup file (dev → unknown, production → error), alert phone missing → warning; rules for heartbeat/backup age (3/25.9/30/49/60 h)/failed attempt/never succeeded/unreadable file/disk (50/80/95)/overall; heartbeat task writes key + TTL; `/health/db` 503 hides `hunter2`/"connect failed". Fakes: `_FakeRedis`, `shutil.disk_usage` monkeypatch (30% used), tmp media + `status.json`.

### Config / infra / docs
- `backend/Dockerfile`: `ARG GIT_COMMIT=unknown` + `ENV GIT_COMMIT=${GIT_COMMIT}` after `USER appuser`.
- `docker-compose.server.yml`: backend `build.args.GIT_COMMIT: ${GIT_COMMIT:-unknown}`; backend `volumes` = media + `${BACKUP_HOST_DIR:-/var/backups/smarthealth}:/backups:ro` (worker/beat unchanged).
- `scripts/deploy.sh`: **new**.
- `.env.server.example`: comment for `ADMIN_ALERT_PHONE`; note that `BACKUP_HOST_DIR` is also mounted into backend; "Not set here: GIT_COMMIT".
- `DEV-WORKFLOW.md`: §6 rewritten (deploy script, 7 services, check via System Health), §9 scheduled jobs table + "start the VM before 10:00", §11 rows for red Background jobs / Backups + rollback with `GIT_COMMIT`.

### Outside the repo
- Server `.env.server`: 5 values changed (see the matrix). Bitwarden note updated by the user.
- TextBee dashboard: new API key; old key revoked.
- `C:\Users\githu\worktree-backup\*.patch`: worktree drafts (can be deleted once the user is sure they're not needed). Contents:
  - `agent-ab03ee5752556336d.patch` (frontend, 6 files): `app/(auth)/login/page.tsx`, `app/(auth)/verify-otp/page.tsx`, `components/layout/Sidebar.tsx`, `lib/auth.ts`, new `app/(dashboard)/settings/security/`, new `lib/passkey.ts` (identical to main's).
  - `agent-ae1dce47461ea86a8.patch` (backend, 13 files): `.env.example`, `endpoints/auth.py`, `api/v1/router.py`, `core/config.py`, `models/__init__.py`, `models/user.py`, `pyproject.toml`, new `0011_passkey_credentials.py`, `endpoints/_cookies.py`, `endpoints/passkey.py`, `models/passkey_credential.py`, `schemas/passkey.py`, `services/passkey_service.py` (all differ from main = older drafts).
  - To inspect: `git apply --stat C:\Users\githu\worktree-backup\<name>.patch`.
- Claude memory: `deployment_setup.md` (Phase 9 + rotation facts), **new** `feedback_no_secret_screens.md` + MEMORY.md index line.
- Deleted: Claude temp `images\1.png`, `images\2.png`.

## User Feedback & Preferences (REQUIRED)

- "tell me first what's best, your recommendation matters too, but ensure it solves a real problem" → give **one recommendation per decision with the concrete failure it prevents**, backed by reading the code first.
- Replied **"."** once: treat as not a go signal, and ask again briefly.
- "what should I do on VM?" → don't assume infra vocabulary ("VM start time"); say plainly what's being asked and where.
- **"go, all defaults"** = accept all of Claude's recommendations as listed.
- "I have merge it." / "merged" → the user opens, merges and deletes PRs themselves; verify with `git fetch` + `git log origin/main` (once their "merged" was early and the remote didn't show it yet).
- Pastes the full CI error on failure ("This is the error: …") → expects a targeted fix + push commands.
- **Screenshots and pastes everything**, including secrets, when a step displays them. Never design a step whose output contains secrets in the same block as output to paste (memory: `feedback_no_secret_screens.md`).
- "can you do it instead?" → happy for Claude to run server commands directly; the harness blocked production writes, so plan on giving commands, but Claude may still do read-only SSH checks itself.
- "on this should i put my number? read -r -p …" → explain interactive prompts; show exactly what to type and where.
- "it arrived but it highlighted as failed. Maybe i do not have a balance on my SIM now" → owns the gateway SIM; reminded to load it before the defense.
- "I revoked it, and i also updated the Bitwarden …, right?" → wants a confirmation checklist; gave a last-4-characters comparison command.
- Wants every step labelled with **where** it runs (PowerShell on PC / server prompt / browser / phone). Continued from the parent.
- Commits and pushes **themselves** using `git commit -F <file>`; multi-line `-m` breaks in PowerShell (a single-line `-m` worked for the small fix).
- "delete them, then /handoff so i can start the phase 10 on a fresh session and also give me the prompt" → wants a paste-ready start prompt at the end of each session.

## Where We're Going

1. **Housekeeping (PC)**: `git checkout main && git pull` (local main is behind at `76cef79`), then `git branch -d feat/system-health`. Ask before touching `README.md` (user's own edit) and `stash@{0}`.
2. **User's open items** (remind once, don't block on them): load the gateway SIM + rerun the one-line SMS test (expect the phone to show **sent**); rewrite the school-ID chip from the card's Print page; regenerate printed demo card PDFs if their QR codes will be scanned.
3. **Phase 10: admin role model B.** First ask the 3 decisions (Open Questions 1–3) in one message, with a recommendation each. Then write a short file-by-file plan (Code Analysis table) and **wait for the user's go**. Expected work:
   a. Backend: `medical_history.py` `_PHI_READ` → `("physician",)`, `_CLINICAL` → `("physician","bhw")`, `include_notes` → physician only; `immunizations.py:_PHYSICIAN_PLUS` per decision; `patients.py:127-129` per decision; verify the list endpoints (`GET /patients/{id}/visits`, `GET /patients/{id}/medical-history`) really omit decrypted fields.
   b. Frontend: `VisitEditModal.tsx:53`, `history/page.tsx:88`, `immunizations/page.tsx:198`, review `[patientId]/page.tsx:211`.
   c. Tests: update `test_medical_history.py` / `test_visits.py` (they use admin on clinical endpoints); add admin → 403 on `GET /visits/{id}` and `notes` redacted for admin.
   d. Docs: `CLAUDE.md` RBAC description (+ thesis text).
   e. PR flow → CI → merge → server `bash /opt/smarthealth-hub/scripts/deploy.sh` → check System Health Version + try logging in as admin and physician.
4. **Local DB tests (helps Phase 10)**: ask the user to either start Docker Desktop (DEV-WORKFLOW §5 containers) or create `smarthealthhub_test` as the Postgres superuser (e.g. pgAdmin / `psql -U postgres -c "CREATE DATABASE smarthealthhub_test OWNER <dev user>"`). Phase 10 changes many tests, and CI round-trips are slow.
5. **Optional**: DEV-WORKFLOW §8 "change one setting without showing the file" (the `read`/`sed` pattern); `shh-backuptest` Docker cleanup; plan a proper `POSTGRES_PASSWORD` / `ENCRYPTION_KEY` rotation (needs a re-encryption script); UptimeRobot on `/health` (pauses needed for the nightly shutdown); in-app NFC button reading URL records; "Card Not Found" heading → "Invalid card link".

## Risks & Blockers

- **SMS fails silently** while the gateway SIM has no load: TextBee says `queued`, the phone fails, and System Health stays green. Must be fixed before the defense. Check the TextBee app/dashboard for failures.
- **`POSTGRES_PASSWORD` and `ENCRYPTION_KEY` were exposed in chat** and not rotated. Low practical risk (DB not internet-reachable; the key needs a DB copy), but note it for the thesis security section.
- **Phase 10 changes access to clinical data**: a wrong role tuple could lock physicians out or leave admin access open. Tests must assert both directions. It's also a demo-visible change (admin screens lose PHI).
- **Daily jobs depend on the VM being started before 10:00** (immunization reminders are exact-day). The VM still needs a manual Start each morning.
- **Local DB-backed tests can't run** (no test DB, Docker Desktop flaky/not running); CI is the only full test run until fixed.

## Open Questions

1. **Allergies / known conditions** (`patients.py:127-129`, also shown on the NFC view page): keep visible to all staff (safety info), or physician-only?
2. **Admin deleting immunization records** (`immunizations.py:54` `_PHYSICIAN_PLUS` used at `:221`): keep admin (data-entry corrections) or physician-only? Read route `:221` first to confirm it's the delete.
3. **Emergency-access override** for admin (audit-logged "break glass" to view PHI): wanted, or none?
4. Did the gateway SIM get loaded, and does the test SMS now show **sent**?
5. (Carried) Did the user run the optional retention test in Phase 8 (fake `db-20261030-000000.dump`)? Harmless either way.

## Quick Start for Next Session

```bash
# Reference docs (read first)
cat plans/handoffs/HANDOFF_phase9-system-health-done_2026-11-19.md
# Phase 10 change list: grandparent "Post-Close Additions §C"
cat plans/handoffs/HANDOFF_azure-go-live_2026-11-18.md
cat CLAUDE.md                                   # RBAC + PHI conventions
cat DEV-WORKFLOW.md                             # §5 checks, §6 deploy.sh, §9 job times

# Key files for Phase 10 (explore adjacent code too)
backend/app/api/v1/endpoints/medical_history.py      # _CLINICAL :51, _PHI_READ :53, include_notes :326
backend/app/api/v1/endpoints/immunizations.py        # _PHYSICIAN_PLUS :54, used :221
backend/app/api/v1/endpoints/patients.py             # allergies/known_conditions :127-129, archive :541
backend/app/core/security.py                         # require_role
frontend/web/components/modals/VisitEditModal.tsx    # canSeePhi :53
backend/tests/test_medical_history.py backend/tests/test_visits.py

# Verify current state (PC PowerShell)
git fetch; git checkout main; git pull; git log --oneline -3     # expect 93a00a1 on top
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health
# Claude may check the server read-only:
#   ssh -o BatchMode=yes azureuser@smarthealth-hub.japaneast.cloudapp.azure.com 'cd /opt/smarthealth-hub && git log --oneline -1'

# Next action
# Ask the 3 Phase 10 decisions (Open Questions 1-3) with a recommendation each,
# then present a file-by-file Phase 10 plan and WAIT for the user's go.
```

## Session Closed
**Closed at:** 2026-11-19 (Manila, UTC+8)
**Commit:** the `session: phase9-system-health-done [standalone-9d299342]` commit on branch `docs/handoff-phase10` that includes this note (run manually by the user from the commands Claude provided; merge via PR, docs only, no server update needed)
**Session status:** Handed off to next session
