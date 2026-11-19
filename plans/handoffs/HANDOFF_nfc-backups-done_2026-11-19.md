# Phase 7 (NFC) and Phase 8 (daily backups) are DONE in production; next is Phase 9, the System Health admin page

**Date:** 2026-11-19
**Status:** IN PROGRESS. Phases 7 + 8 completed and verified on the live server. Phase 9 (System Health page) not started; user decisions for it are recorded below.
**Bead(s):** none (`bd` CLI not installed on this PC)
**Epic:** Deploy SmartHealth Hub to production and harden it (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `3`
**Parent:** `HANDOFF_azure-go-live_2026-11-18.md`
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > this

> ⚠️ This repo is **PUBLIC**. This file deliberately contains no passwords, keys,
> email addresses, phone numbers, NFC signatures or chip serial numbers. Never add them.

---

## Since Last Handoff

- **Parent step 1 (housekeeping)**: DONE. PRs #18 (DEV-WORKFLOW.md) and #19 (handoff update) were already merged (`c50b7e6`). The user switched the PC to `main`, pulled and deleted the merged branches. Status questions answered: admin password **changed**, BHW login tested + password **changed**, GitHub Deploy workflow **disabled**, Azure auto-shutdown **enabled at 11:00 PM** (UTC+08:00) this session.
- **Parent step 1d (phase order)**: user chose **(b)**: NFC → backups → System Health → admin model B.
- **Parent step 2 (Phase 7 NFC)**: DONE, but on the user's **own school ID card** (NXP MIFARE Classic 1K, 4-byte UID) instead of NTAG stickers. The user has no time to buy chips now and will use an **NTAG215 at the thesis defense**. Signed link written with NFC Tools; tap, 403 on tampered link, and `/nfc-monitor` all verified.
- **Parent open question "does `readNfcTag` accept URL records?"**: answered **NO**. `frontend/web/lib/nfc.ts:104` only accepts `recordType === "text"` with JSON `{patient_id, card_version}` (exactly 2 keys). The in-app "Tap NFC Card" button shows "Could not read the card" for NFC Tools URL chips. The phone's native tap (browser opens the link) is what works and what gets demoed.
- **Parent handoff error corrected**: it said seeded cards use `HC-{year}-{8 hex}`. Actual card numbers are `SH-YYYY-NNNNNN` (`backend/app/services/card_generation_service.py:14-61`). Patient codes are `BHC-YYYY-NNNNNN`. The `/view` page's blue pill shows the **patient code**, not the card number (looked like a mismatch in the test; it isn't).
- **Parent step 3 (Phase 8 backups)**: DONE and merged as **PR #20** (merge `08b4906`), with a different design detail than the parent proposed: backup time **22:30** (not 02:00) because of the 23:00 auto-shutdown, plus an automatic catch-up after VM start. The user saved the **whole `.env.server`** into Bitwarden (Secure note), which resolves the parent's top risk "server secrets exist in one place only".
- **Parent risk "NTAG213 capacity"**: moot for now (MIFARE Classic 1K holds ~716 bytes NDEF). Still relevant for the defense chip: buy NTAG215.
- **Parent step 6 (cleanup)**: still NOT done. Plus a new leftover: local test project `shh-backuptest` (see Risks).
- **Trajectory**: on path. Phase 9 is next, then Phase 10 (admin model B).

## Reference Documents

- `DEV-WORKFLOW.md` (repo root): the agreed day-to-day process. **Renumbered this session**: new **§10 Backups and restore**; Troubleshooting is now §11, Don'ts §12, Working with Claude §13. §9 now records the 11 PM auto-shutdown.
- `DEPLOY.md`: first-time setup. §8 now points to the `backup` service (the old `/etc/cron.daily/smarthealth-backup` host-cron recipe was removed).
- `CLAUDE.md`: project conventions (no PHI on NFC/QR, audit every write, Alembic for schema, AES-256-GCM on encrypted columns).
- `plans/handoffs/HANDOFF_azure-go-live_2026-11-18.md` (parent): **Post-Close Additions §B** (system-admin gap table + Phase 9 design) and **§C** (admin model B change list for Phase 10). Read §B before starting Phase 9.
- `plans/handoffs/HANDOFF_vercel-docker-deploy_2026-11-17.md` (grandparent): NFC security design, compose stack details.
- Claude memory: `deployment_setup.md` (updated this session with Phase 7/8 results), `pnpm_not_npm.md`, `project_scaffold.md`.

## The Goal

SmartHealth Hub (thesis project: Barangay Health Center records system with NFC/QR health cards, SMS reminders, OTP MFA) runs in production: website `https://smarthealth-hub-two.vercel.app` (Vercel), API `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose). The roadmap hardens it for real use and the thesis defense: Phase 7 NFC chips ✅, Phase 8 backups ✅, **Phase 9 System Health admin page (next)**, Phase 10 admin role model B (admin loses access to clinical PHI). Phase 9 gives the admin one page that answers "is everything working?": database, Redis, Celery worker + beat alive, disk, media size, last backup, deployed version, so a dead worker or failed backup is no longer silent.

## Where We Are

- **Live stack**: 7 services on the server (`dc ps`): backend (healthy, up 28 h), worker, beat, caddy, db postgres:18-alpine (healthy), redis (healthy), **backup** (new, postgres:18-alpine). The backend was NOT rebuilt this session; Phase 9 will be the first backend rebuild since go-live.
- **Server repo**: `/opt/smarthealth-hub` on branch `main` at `08b4906` (user ran `git checkout main && git pull && dc up -d` after merging PR #20).
- **PC repo**: branch `main` at `08b4906`, clean except the never-commit files (`backend/celerybeat-schedule-shm/-wal` modified; `START.md`, `dump.rdb`, `start-tunnel.ps1` untracked). Local branch `feat/daily-backups` still exists (merged; can be deleted with `git branch -d feat/daily-backups`).
- **Two leftover agent worktrees** exist under `.claude/worktrees/` (`worktree-agent-ab03ee5752556336d`, `worktree-agent-ae1dce47461ea86a8`, both at `d041507` "feat(dashboard): add error boundary and loading states"). Not from this chain; the user wasn't asked about them. Don't touch without asking.
- **Phase 7 result**: signed link for card `SH-2026-000001` (a seeded demo patient, patient code `BHC-2026-000015`) written to the school ID as an NDEF URL record. Real tap → patient summary page; changed `sig` → 403 "This card link is not valid. Ask the health center to rewrite this card."; `/nfc-monitor` showed the tap (polled 10:29:23, scanned 10:29:27).
- **Phase 8 result**: backup service running; files in `/var/backups/smarthealth` on the host; restore test passed against production data; weekly download to the PC works.
- **Backup schedule**: daily **22:30 Asia/Manila**; 23:00 VM auto-shutdown; catch-up backup ~90 s after the next start if a run was missed.
- **Backup files on server now** (at handoff): `db-20261119-144958.dump`, `db-20261119-145212.dump`, `db-20261119-145437.dump` (+ matching `media-*.tar.gz`), `status.json`. Possibly a fake `db-20261030-000000.dump` if the user skipped the optional retention test (see Open Questions).
- **PC backup copy**: `C:\Users\githu\SmartHealthBackups\db-20261119-145437.dump` (0.11 MB) + `media-20261119-145437.tar.gz` (2.98 MB).
- **Secrets**: whole `.env.server` saved in the user's Bitwarden vault as a Secure note "SmartHealth Hub .env.server" (user confirmed "Step 1 done"; contents never shown to Claude).
- **Azure auto-shutdown**: ON, 11:00:00 PM, time zone `(UTC+08:00) Beijing, Chongqing, Hong Kong, Urumqi` (same offset as Manila), notification **No**. The VM must be **started manually** each morning in the portal.
- **Celery jobs that never run now** because of the 23:00 shutdown: `run-ai-risk-scoring` (01:00), `run-ai-anomaly-detection` (01:30). User decided to move them to **21:00 and 21:30**. Also at risk: `mark-missed-appointments-daily` at exactly **23:00** (`celery_app.py:142-149`), the same minute as the shutdown (not yet discussed with the user).
- **Docker Desktop on the PC is unreliable**: engine returned `500 Internal Server Error` on `/info`, came up after ~50 s, worked briefly, then dropped out twice mid-test (once `Exited (255)` after an engine restart, once hard timeouts). At handoff it is not responding. Local container testing can't be relied on.
- **Local leftovers from testing**: compose project `shh-backuptest` (container `shh-backuptest-db-1` exited, maybe an orphan `shh-backuptest-backup-run-*`, volumes `shh-backuptest_media` / `_backups` / db volume). Test files: scratchpad `backuptest/compose.yml` + `seed.sql` (session temp dir, may be gone).
- **CI**: green on PR #20 (user merged after checks passed).
- **Live API health** at session start: `{"status":"ok","service":"smarthealth-hub-api","version":"0.1.0"}`; tampered-link probe returned **403** (signatures enforced in production).

## What We Tried (Chronological)

1. **Onboarding (read-only)**: `bd` not installed; `gh` not installed. `git fetch` showed PRs #18/#19 merged. `curl /health` OK. Probed `GET /view/HC-2026-00000000?sig=000…` on prod → 403. Computed the link size: 103 bytes after the `https://` prefix (~110 on chip). Read `nfc.ts` and found it only parses Text-JSON records.
2. **School ID as NFC chip**: the user reported the card's 4-byte serial number (deliberately not recorded here; public repo). Claude warned: the card belongs to the school (attendance/door system), a 4-byte UID suggests MIFARE Classic (proprietary crypto, not standard NDEF), and lock/format are irreversible. The user read it with NFC Tools → "NXP - Mifare Classic 1k", reported it as readable + writable, and chose to use it anyway for now. Mitigations given: only a seeded demo patient, never Lock / Set password / make read-only, `Other → Erase tag` after the defense, NTAG215 for the defense (MIFARE Classic only reads on NXP-capable phones; a panel member's phone may not read it).
3. **Phase 7 test procedure** (all passed): Part 1: Chrome on S21 → Health Cards → Print page → "NFC Tools Task URL" → Copy. Part 2: open link (patient page), change last sig char (403), `/nfc-monitor` on PC updates. Part 3: NFC Tools → Write → Add a record → URL/URI → paste, check no `https://https://` → Write. Part 4: close NFC Tools, tap on home screen → browser opens the summary.
4. **Phase 8 design**: found `scripts/backup_db.sh` (TODO stub "Phase 6") and `backend/scripts/backup_db.py` / `restore_db.py` (Python, need `pg_dump` on PATH). The backend image (`python:3.12-slim-bookworm`, `backend/Dockerfile:49-65`) has **no pg_dump**, and Debian's client would be the wrong major version. → Chose a separate `backup` service on `postgres:18-alpine` (exact version match, no backend rebuild).
5. **Local test attempt #1**: Docker engine 500 → background wait loop → ready after ~50 s (`28.5.1`). `docker compose up -d db` OK, but `docker compose run` (without `-T`) to seed media **hung for 300 s**.
6. **Local test attempt #2**: Docker had restarted (`Exited (255)`). Re-ran with `--wait` + `timeout`: db healthy, 60 test patients, media seeded with `docker run`. `backup.sh now` failed with `sh: can't open 'C:/Program Files/Git/scripts/backup.sh'`, caused by **Git Bash MSYS path conversion** (fix: `export MSYS_NO_PATHCONV=1`). That same run proved **TZ works**: container clock `2026-11-19 14:38 PST +0800`.
7. **Local test attempt #3**: engine 500 on the networks API, then no response at all for minutes. Abandoned local testing.
8. **Option B, test on the production server from the branch**: user committed `1a90ee3` + pushed; first typed `cd /opt/smarthealth-hub` in the **PC** PowerShell (error `C:\opt\smarthealth-hub` not found) → re-explained ssh first. On server: `git fetch`, `git checkout feat/daily-backups`, `dc up -d backup` (db stayed Healthy, backup Started in 0.6 s).
9. **First checks ran too early** (within the 90 s start delay): empty folder, no status.json. The restore test a moment later found `db-20261119-144958.dump` and passed (all 9 tables equal live).
10. **Cosmetic fix**: `verify-restore.sh` printed `NOTICE: database "restore_check" does not exist, skipping` → added `-c "SET client_min_messages = warning"` (commit `7da784c`).
11. **Full verification on server**: log lines, `status.json` ok, owners/modes, manual `backup.sh now` (second set at 14:52:12), a third set at 14:54:37 (likely the optional retention test run). PR #20 created with the provided description, CI green, merged. Server back to `main`.
12. **Weekly download test**: `.\scripts\download-backup.ps1` on the PC fetched the newest db + media files.
13. **Handoff prep**: re-read `celery_app.py` beat schedule; found `mark-missed-appointments-daily` at 23:00 (shutdown minute) and a misleading comment on the report jobs (see Code Analysis).

## Key Decisions

- **Phase order (b)**: NFC → backups → System Health → admin model B (user). Rejected (a) backups-first, although Claude suggested saving secrets first (done anyway in Phase 8 step 1).
- **School ID now, NTAG215 at the defense** (user decision, after warnings). Rejected for now: buying NTAG215 first (no time); the UID-binding path with no writing (needs code, weaker security, and no current flow reads a UID from a phone in the cloud setup).
- **Separate `backup` container (postgres:18-alpine)** instead of host cron (DEPLOY.md's old recipe) or the Python scripts in the backend image. Why: version match, version-controlled config, starts with the stack, no backend image change, no root cron on the host.
- **Backups in a host folder `/var/backups/smarthealth`** (bind mount), not a named volume and not inside the repo. Why: survives `dc down -v`, easy `scp`, not touched by `git clean`.
- **22:30 schedule + catch-up loop** instead of crond at 02:00. Why: the VM is off 23:00 → morning; the loop runs a backup whenever the last success is older than the most recent scheduled time (with a 30-minute retry gap after failures).
- **Retention only after a successful backup**, so a broken job can't delete the last good copies.
- **Permissions**: folder 711, dumps 600, `status.json` 644, all owned `1000:1000` (azureuser). Why: PHI in dumps; 711 + 644 lets the Phase 9 backend (runs as `appuser`, a different uid) read `status.json` **by name** without listing or reading the dumps.
- **Off-server copy = weekly manual download to the PC** (`$HOME\SmartHealthBackups`, deliberately **outside OneDrive** because it's PHI). Rejected for now: rclone to Google Drive (setup effort; PHI in a personal cloud), Azure Blob (uses credit).
- **Save the whole `.env.server`** in Bitwarden, not just 4 keys (a full rebuild needs all 31 lines).
- **Test on the server from the branch** (only the `backup` service started) instead of merging untested code, once local Docker failed. Safe because the backup service only reads the DB and writes its own folder.
- **Phase 9 AI job times: 21:00 (risk scoring) and 21:30 (anomaly detection)** (user decision at the end of this session).

## Evidence & Data

### Commit log (this session)
| Hash | Branch | Summary |
|---|---|---|
| `1a90ee3` | feat/daily-backups | feat(backup): daily database + media backups on the server (8 files, +427/−50) |
| `7da784c` | feat/daily-backups | fix(backup): hide the harmless "does not exist, skipping" notice in verify-restore |
| `08b4906` | main | Merge PR #20 (feat/daily-backups); server + PC are on this |

### Phase 7 verification matrix
| Test | Expected | Result |
|---|---|---|
| Real signed link in browser | patient summary | ✅ page for patient `BHC-2026-000015` |
| Last sig char changed | 403 "This card link is not valid…" (heading says "Card Not Found") | ✅ |
| `/nfc-monitor` (PC, logged in) | tap appears within ~2 s | ✅ |
| Write URL record with NFC Tools to school ID | success | ✅ |
| Physical tap (NFC Tools closed) | browser opens summary | ✅ |
| In-app "Tap NFC Card" button | n/a | ❌ by design: Text-JSON only |

### Phase 8 server verification (2026-11-19, Manila time)
| Check | Output |
|---|---|
| service start | `service started: daily at 22:30 Asia/Manila (container clock: 14:48 +0800), keeping 14 days` at 14:48:28 |
| catch-up backup | 14:49:58 dumping `smarthealthhub` → `db-20261119-144958.dump`; media archived; `finished in 1s: database 113 KB, media 3048 KB; removed 0 old file(s)` |
| status.json | `"status": "ok"`, `db_bytes: 116355`, `media_bytes: 3121238`, `duration_seconds: 1`, `"schedule": "daily 22:30 Asia/Manila"`, `"keep_days": 14` |
| `ls -l` | `-rw------- azureuser azureuser` for dumps/tars, `-rw-r--r--` for status.json (431 bytes) |
| manual `backup.sh now` | 14:52:12 → second set, same sizes |
| retention test (optional) | user ran something producing a 14:54:37 set; output not pasted |
| PC download | `db-20261119-145437.dump` 114 KB @ 264.9 KB/s; `media-20261119-145437.tar.gz` 3048 KB @ 3.1 MB/s |

### verify-restore.sh on production (backup `db-20261119-144958.dump`)
```
TABLE                    BACKUP         LIVE
users                         3            3
patients                     60           60
health_cards                 11           11
visits                       80           80
medical_history              54           54
immunizations               117          117
appointments                 40           40
sms_logs                      4            4
audit_logs                   45           45
migration                  0028         0028
RESULT: OK - the backup restores.
```
(11 health cards = 10 seeded + 1 the user generated, `SH-2026-000001`.)

### Local Docker test attempts (PC)
| Attempt | Symptom | Cause / outcome |
|---|---|---|
| `docker info` at start | `500 Internal Server Error … /v1.51/info` | engine still starting; ready after ~50 s (`28.5.1`) |
| `docker compose run` (no `-T`) seeding media | hung 300 s | unclear (TTY / engine flapping); use `docker run` + `timeout` |
| `docker compose run … sh /scripts/backup.sh now` | `can't open 'C:/Program Files/Git/scripts/backup.sh'` | Git Bash path conversion → `MSYS_NO_PATHCONV=1` |
| same, after fix | `500 … /networks?filters=…` | engine dropped out again |
| `docker info` x6 over 2 min | no response (timeouts) | Docker Desktop unusable; abandoned |
| WSL state | `Ubuntu Running 2`, `docker-desktop Running 2` | WSL fine; engine itself failing |

### Celery beat schedule (`backend/app/workers/celery_app.py:89-151`, `timezone = "Asia/Manila"`)
| Entry | Task | Schedule now | Runs with 23:00–morning shutdown? | Phase 9 plan |
|---|---|---|---|---|
| dispatch-appointment-reminders | reminders.dispatch_appointment_reminders | every hour :00 | daytime only | keep |
| dispatch-immunization-reminders | reminders.dispatch_immunization_reminders | 08:00 | only if VM started before 8 | keep (note) |
| run-ai-risk-scoring | ai_tasks.run_risk_scoring | 01:00 | ❌ never | **→ 21:00** (user) |
| run-ai-anomaly-detection | ai_tasks.run_anomaly_detection | 01:30 | ❌ never | **→ 21:30** (user) |
| check-sms-failure-rate | monitoring.check_sms_failure_rate | hourly :30 | daytime | keep |
| audit-scan-anomalies | audit.scan_anomalies | hourly :30 | daytime | keep |
| send-weekly-report | reports.send_weekly | Fri 09:00 (Manila) | yes if VM on | keep; fix comment |
| send-monthly-report | reports.send_monthly | Fri 09:15, days 22-31 | yes if VM on | keep; fix comment |
| mark-missed-appointments-daily | workers.mark_missed_appointments | 23:00 with `nowfun=manila_now` | ⚠️ races the shutdown | propose **22:00**, ask user |
| (new) backup service | not Celery | 22:30 | yes + catch-up | n/a |

### Timeline (user prompt → outcome)
| # | User said | Outcome |
|---|---|---|
| 1 | read handoff, onboard, wait for go-ahead | read-only onboarding; found the Text-JSON-only NFC reader; prod 403 probe |
| 2 | chips = school ID; order **B**; 3 status answers; "give the steps" for auto-shutdown | school-ID warning; portal steps for auto-shutdown |
| 3 | "Housekeeping (done)"; tag type MIFARE Classic 1k; will use school ID now, NTAG215 at defense | Phase 7 Parts 1–4 instructions |
| 4 | 3 screenshots: 403 page, patient page, `/nfc-monitor`; "Part 1,2,3,4 works" | explained SH vs BHC codes; Phase 8 plan + 2 questions |
| 5 | auto-shutdown screenshot (On, 11:00 PM, UTC+08:00) | wrote backup code on `feat/daily-backups` |
| 6 | "give me the clear step for step 1 and 2" | click-level Bitwarden + Docker Desktop steps |
| 7 | Bitwarden screenshot: "where should i add the cat …?" | explained terminal vs vault; `+ Add → Note` |
| 8 | "Step 1 done" | Docker 500 → background wait |
| 9 | "the docker is running" | local test attempts 1–3 failed (Docker) |
| 10 | "im doing the option B" + PC-side `cd /opt…` error | ssh-first instructions |
| 11 | server output: service started, checks too early, restore test OK | 90 s delay explained; NOTICE fix |
| 12 | full server output + commit/push of the fix | all checks ✅; PR text + merge steps |
| 13 | "merged", `dc ps` (7 services), download script output | Phase 8 done; Phase 9 proposal |
| 14 | "list me the phases done" | done / not-started overview |
| 15 | "use 9:00 and 9:30 PM … /handoff first … give me also the prompt" | this file |

### Exact server command log (all as `azureuser`, all worked)
```bash
cd /opt/smarthealth-hub
git fetch origin                       # 6595469..c50b7e6 main; new feat/daily-backups
git checkout feat/daily-backups        # test from the branch before merging
dc up -d backup                        # db Healthy (reused), backup Started
dc logs --tail 20 backup               # wait ≥ 2 min after `up` (90 s start delay)
cat /var/backups/smarthealth/status.json
ls -l /var/backups/smarthealth
dc exec backup sh /scripts/verify-restore.sh
dc exec backup sh /scripts/backup.sh now
# optional retention test:
touch -d '20 days ago' /var/backups/smarthealth/db-20261030-000000.dump && dc exec backup sh /scripts/backup.sh now
# after merging PR #20:
git checkout main && git pull && dc up -d && dc ps     # 7 services
```
PC: `git add <8 paths>` → `git commit -F <scratchpad>\commit-backups.txt` → `git push -u origin feat/daily-backups`; later `commit-backups-2.txt` + `git push`; `.\scripts\download-backup.ps1`.

### Consolidated failed approaches (don't repeat)
| Attempt | Error | Lesson |
|---|---|---|
| Server command typed in PC PowerShell | `Cannot find path 'C:\opt\smarthealth-hub'` | ssh first; show both prompts |
| Checking backups right after `dc up -d backup` | empty folder / no status.json | wait > 90 s (start delay) |
| `docker compose run` without `-T` from Claude's shell | hung 300 s | use `docker run`/`-T` + `timeout` |
| Container paths in Git Bash `docker` args | rewritten to `C:/Program Files/Git/...` | `export MSYS_NO_PATHCONV=1` |
| Relying on Docker Desktop for tests | 500s, engine drops out | test on server from a branch, or pytest only |
| Python `backup_db.py` in the backend container | no `pg_dump` in `python:3.12-slim-bookworm` | dedicated postgres:18-alpine service |
| `git add scripts/backup_db.sh` after `git rm` (avoided) | would fail "pathspec did not match" and abort the add | the deletion is already staged |

### Local test harness (scratchpad, may be gone; recreate if needed)
- `backuptest/compose.yml`: project `shh-backuptest`; `db` = postgres:18-alpine with `seed.sql` in `/docker-entrypoint-initdb.d`; `backup` = same image, env like prod, scripts bind-mounted from the repo, `/backups` as a **named volume** (Windows bind mounts don't honour chown).
- `seed.sql`: extensions `pgcrypto`, `uuid-ossp`, `pg_trgm`; enum `card_status`; trigram GIN index on `patients.full_name`; the 9 counted tables + `alembic_version('0028')`; 60 patients, 10 cards, 80 visits, 30 history rows, 120 immunizations, 40 appointments, 5 SMS logs, 200 audit rows. Matches prod's extension use (0001 creates pgcrypto + uuid-ossp; 0025 creates pg_trgm).

### Backup sizes (baseline for Phase 9 disk display)
DB dump 113 KB, media tar 3048 KB per backup → ~3.2 MB/day → ~45 MB for 14 days. Disk: 28 GB, 29.5% used at login on 2026-11-19 (06:48 UTC). Memory 36%, swap 0%.

## Code Analysis

- **`infra/backup/backup.sh`** (POSIX sh, busybox): modes `loop` (default) / `now`. Env: `BACKUP_TIME` (22:30), `BACKUP_KEEP_DAYS` (14), `BACKUP_OWNER` (1000:1000), `BACKUP_MIN_FREE_MB` (1024), `PG*` connection vars, `TZ`. Constants: `RETRY_MINUTES=30`, `CHECK_SECONDS=300`, start delay `nap 90`. State file `/backups/.last_success` (key=value: epoch, at, db_file, db_bytes, media_file, media_bytes, duration). `status.json` schema: `{status: ok|error, message, last_attempt_at (ISO +08:00), last_success: {at, db_file, db_bytes, media_file, media_bytes, duration_seconds} | null, schedule, keep_days}`; written atomically (tmp + mv). `due_epoch()` = most recent `today BACKUP_TIME` ≤ now (busybox `date -d "YYYY-MM-DD HH:MM"`). Retention: `find -maxdepth 1 -type f (db-*.dump|media-*.tar.gz) -mtime +$((KEEP_DAYS-1)) -delete`; stale `.*.part` removed after 120 min. SIGTERM handled via `trap` + `sleep & wait`.
- **`infra/backup/verify-restore.sh`**: temp DB `restore_check`; tables `users patients health_cards visits medical_history immunizations appointments sms_logs audit_logs` + `alembic_version`; `pg_restore --no-owner --no-acl --exit-on-error`; `trap cleanup EXIT` drops the temp DB.
- **Compose `backup` service** (`docker-compose.server.yml`): `command: ["sh", "/scripts/backup.sh", "loop"]`; volumes `./infra/backup:/scripts:ro`, `media:/media:ro`, `${BACKUP_HOST_DIR:-/var/backups/smarthealth}:/backups`; `depends_on db: service_healthy`; network `internal`. Scripts are bind-mounted, so `git pull` updates them without a rebuild (`dc restart backup` to reload the loop).
- **Phase 9 touchpoints (verified to exist)**:
  - `backend/app/api/v1/endpoints/system_config.py`: `router = APIRouter(prefix="/system", tags=["System"])` (`:27`), `AdminOnly = require_role("admin")` (`:29`), `GET /system/...` system info (`:36-41`), registration URL (`:64-69`). A new `GET /system/status` fits here (or a sibling module registered in `backend/app/api/v1/router.py:36/:101`).
  - `backend/app/main.py:528-554` `health_db()`: on exception `raise HTTPException(503, detail=f"Database unavailable: {exc}")`, which leaks raw exception text publicly. `backend/tests/test_health.py:27-28` only tests the 200 path.
  - `backend/app/core/config.py:172` `MEDIA_DIR` (prod: `/app/media` via compose env); `:182` `ADMIN_ALERT_PHONE: str = ""`, used by `backend/app/workers/audit_tasks.py:101-112` (and the SMS monitoring task).
  - `backend/app/workers/celery_app.py:89-151` beat schedule (table above). **No tests pin these times** (grep of `backend/tests` for the entry names found nothing).
  - Frontend settings index `frontend/web/app/(dashboard)/settings/page.tsx` links cards: `/settings/users` (`:237`), `/settings/audit-log` (`:250`). Subpages: `audit-log/`, `intake-applications/`, `profile/`, `registration-qr/`, `security/`, `users/`. New page goes in `settings/system-health/page.tsx`, modeled on `settings/audit-log/page.tsx` (admin-only, `apiFetch`).
  - The backend container runs as `appuser` (`backend/Dockerfile` `useradd --system`), so reading `/var/backups/smarthealth/status.json` needs the 711/644 modes the backup script sets (already in place).
- **Comment bug (minor)**: `celery_app.py:123/130` say "09:00 UTC = 17:00 PHT", but `celery_app.conf.timezone = "Asia/Manila"` (`:151`, also `:71`), so the reports actually fire at **09:00/09:15 Manila**. Verify, then fix the comment (or the time, if 17:00 was intended; ask the user).
- **NFC facts confirmed**: `nfc_payload_service.py:65/77/90` (sign/verify/build), `health_cards.py:994-1094` view handler (sig check before DB lookup, then `card_number`, then `upper(nfc_uid)`), `_NFC_VIEW_RATE_LIMIT = 20` (`:906`), `_get_client_ip` takes the first `X-Forwarded-For` (`:919-924`). Caddy 2.8 overwrites XFF from untrusted clients, so it's not spoofable.

## Files Changed

### Infrastructure (committed, PR #20)
- `infra/backup/backup.sh`: new, 198 lines (daily backup loop, see Code Analysis).
- `infra/backup/verify-restore.sh`: new, 62 lines (restore test).
- `docker-compose.server.yml`: header comment lists `backup`; new `backup` service (+32 lines).
- `.env.server.example`: optional `BACKUP_TIME`, `BACKUP_KEEP_DAYS`, `BACKUP_HOST_DIR`, `BACKUP_OWNER` (commented).
- `scripts/download-backup.ps1`: new; weekly PC download of the newest db + media file; skips already-downloaded files; params `-Server`, `-Destination`.
- `scripts/backup_db.sh`: **deleted** (unimplemented placeholder). `backend/scripts/backup_db.py` / `restore_db.py` kept (local dev use; need a local `pg_dump`).

### Docs (committed, PR #20)
- `DEV-WORKFLOW.md`: §1 services row includes `backup`; §9 auto-shutdown note; **new §10 Backups and restore** (schedule table, server commands, weekly download, Restore A "data damaged", Restore B "server gone" with restore-before-backend-start warning); Don'ts += "don't delete files in /var/backups/smarthealth by hand"; renumbered §11–§13.
- `DEPLOY.md` §8: replaced the host-cron recipe with the backup service + day-one check commands.

### Outside the repo
- Server: `/var/backups/smarthealth/` (backups + status.json + `.last_success`); container `smarthealth-backup-1`.
- Azure: auto-shutdown 23:00.
- PC: `C:\Users\githu\SmartHealthBackups\`; Bitwarden Secure note; Docker leftovers `shh-backuptest*`.
- Claude memory `deployment_setup.md`: Phase 7/8 results, auto-shutdown, card/patient code formats, Docker Desktop flakiness, next = Phase 9.

## User Feedback & Preferences (REQUIRED)

- "For the chips, i'm only using my SchoolID that has an NFC Chip in it" → then after warnings: "I will try to use SchoolID to demo first since i do not have time to buy NTAG215, on the defense i will use a NTAG215". Accepts risk knowingly; respect it, don't re-argue.
- Phase order: **"B"**.
- Status answers: admin password changed YES, BHW tested + password changed YES, Deploy workflow disabled YES, auto-shutdown "NOT SURE, GIVE THE STEPS, ONCE DONE DO THE NEXT STEP, I'LL GIVE YOU TO GO SIGNAL" → **waits to give explicit go signals between steps**; don't run ahead.
- "give me the clear step for step 1 and 2" → wants numbered, click-level steps with the expected screen/prompt shown.
- Showed the Bitwarden screen and asked "where should i add the cat /opt/smarthealth-hub/.env.server on Bitwarden?" → confuses where commands run vs where data goes. Always say **where** each step happens (PowerShell on PC, server prompt, browser/app).
- Ran `cd /opt/smarthealth-hub` in the PC PowerShell → same lesson: show `PS C:\...>` vs `azureuser@smarthealth-server:~$` and repeat "ssh first".
- Pastes full terminal output and screenshots after each step; responds well to a ✅ table summarizing what passed.
- Commits and pushes **themselves** using `git commit -F <file>`; worked smoothly twice this session. Opens and merges PRs themselves ("merged").
- Chose **Option B (test on the server)** when local Docker failed.
- "list me the phases done" → likes a status overview of done vs not started.
- "use 9:00 and 9:30 PM" for the AI jobs.
- "i want you to /handoff first so i can continue this session on a fresh session … give me also the prompt to start it" → wants a paste-ready start prompt for the next session.
- Never paste secrets into chat (user complied: "Step 1 done" without contents).

## Where We're Going

1. **Small housekeeping (PC)**: `git branch -d feat/daily-backups`. If Docker Desktop works: `docker compose -p shh-backuptest down -v` (only `shh-backuptest*`). Ask about the two `.claude/worktrees/agent-*` worktrees.
2. **Phase 9: System Health page.** Start with a short written plan of files to touch and **wait for the user's go**. Scope:
   a. Backend `GET /api/v1/system/status` (admin only, in `system_config.py` or a new module on the same `/system` prefix): DB ok + `pg_database_size(current_database())`; Redis `PING`; Celery liveness via a new beat entry (every minute) whose task (run by the worker) writes a Redis key such as `system:heartbeat` = ISO time with TTL ~180 s (fresh key ⇒ beat AND worker alive); disk free via `shutil.disk_usage("/app/media")`; media size via a walk of `MEDIA_DIR` (≈3 MB now); last backup = parse `/backups/status.json` (mount `${BACKUP_HOST_DIR:-/var/backups/smarthealth}:/backups:ro` into **backend only**); deployed commit (e.g. `GIT_COMMIT` build arg/env set at deploy: `GIT_COMMIT=$(git rev-parse --short HEAD) dc up -d --build`, then update DEV-WORKFLOW §6); `ADMIN_ALERT_PHONE` configured yes/no (never the number).
   b. Beat schedule: AI risk scoring → **21:00**, anomaly → **21:30** (user decision); propose `mark-missed-appointments-daily` 23:00 → **22:00** (ask); fix the misleading UTC comments on the report jobs.
   c. Sanitize `/health/db` (`main.py:553`): generic "Database unavailable" (keep the server-side log); add a test for the 503 body.
   d. Frontend `settings/system-health/page.tsx` (admin only) + a card on `settings/page.tsx` like Users/Audit Log; green/amber/red status cards; show backup age (amber > 26 h, red > 50 h, for example) and heartbeat age.
   e. Tests: pytest for `/system/status` (admin 200, non-admin 403, missing status.json handled), heartbeat task unit test; frontend `tsc` + lint. Docker Desktop is unreliable, so rely on local pytest/ruff/mypy/tsc (DEV-WORKFLOW §5) + CI.
   f. PR flow → merge → server `git pull && dc up -d --build` (first backend rebuild since go-live; ~1–3 min) → user sets `ADMIN_ALERT_PHONE` in `.env.server` themselves → `dc up -d`.
3. **Phase 10: admin role model B** (parent Post-Close Additions §C). Resolve first: allergies/known_conditions visibility, admin immunization delete, emergency-access override.
4. **Optional**: UptimeRobot on `/health` (note: alerts every night because of the shutdown unless paused), in-app NFC button reading URL records, automated deploy, DEPLOY.md Azure specifics, coverage gate, legacy `infra/` files, "Card Not Found" heading → "Invalid card link" for the 403 page.

## Risks & Blockers

- **Docker Desktop on the PC is flaky** (500s, drops out). Don't plan on local container tests; use pytest/ruff/mypy/tsc locally and verify on the server. In Git Bash, `docker` commands with container paths need `MSYS_NO_PATHCONV=1`.
- **The VM must be started manually each morning.** If it's off: logins, NFC taps and SMS all stop; backups catch up on start. Azure credit ≈ $25–30/month with the shutdown (estimate).
- **Phase 9 is the first backend rebuild since go-live**: a migration or startup error would take the API down. Keep Phase 9 migration-free if possible (it should be: Redis key + file reads only).
- **School ID as demo chip**: may not read on phones without MIFARE Classic support (non-NXP controllers), which matters at the defense → use NTAG215 there.
- **Backups contain PHI** in `/var/backups/smarthealth` and `C:\Users\githu\SmartHealthBackups` (outside OneDrive). Encrypted columns stay encrypted; the key is in Bitwarden only.

## Open Questions

- `mark-missed-appointments-daily` at 23:00 races the shutdown: move to 22:00 (Claude's proposal) or another time?
- Report jobs: were they meant to fire at 17:00 PHT (comment) or 09:00 PHT (actual)?
- Did the user run the optional retention test (fake `db-20261030-000000.dump` + `backup.sh now` → `removed 1 old file(s)`)? If they created the fake file but the run didn't delete it, it's harmless (empty file) but should be checked: `ls -l /var/backups/smarthealth`.
- Deployed-commit display: build arg (`GIT_COMMIT=…` at deploy) or simpler alternatives? Decide in the Phase 9 plan.
- The two `.claude/worktrees/agent-*` worktrees: keep or remove?
- Phase 10 open questions remain (parent §C).

## Quick Start for Next Session

```bash
# Reference docs (read first)
cat plans/handoffs/HANDOFF_nfc-backups-done_2026-11-19.md
# Parent: Post-Close Additions §B (Phase 9 design) and §C (Phase 10)
cat plans/handoffs/HANDOFF_azure-go-live_2026-11-18.md
cat DEV-WORKFLOW.md                       # §5 checks, §6 deploy, §10 backups

# Key files for Phase 9 (explore adjacent code too)
backend/app/api/v1/endpoints/system_config.py      # /system prefix, AdminOnly
backend/app/api/v1/router.py                        # router registration (:36, :101)
backend/app/workers/celery_app.py                   # beat schedule :89-151
backend/app/main.py                                 # /health (:513), /health/db (:528-554)
frontend/web/app/(dashboard)/settings/page.tsx      # settings cards (:237, :250)
frontend/web/app/(dashboard)/settings/audit-log/page.tsx   # admin page pattern
docker-compose.server.yml                           # backend + backup services
infra/backup/backup.sh                              # status.json producer

# Verify current state (PC PowerShell)
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health
git status -sb ; git log --oneline -3
# Server (user runs): dc ps (7 services) ; cat /var/backups/smarthealth/status.json

# Next action
# Housekeeping (delete merged branch), then present a short Phase 9 file-by-file plan
# (endpoint, heartbeat task, beat 21:00/21:30, /health/db fix, settings page, tests)
# and WAIT for the user's go signal before writing code.
```

## Session Closed
**Closed at:** 2026-11-19 (Manila, UTC+8)
**Commit:** the `session: nfc-backups-done [standalone-9d299342]` commit on branch `docs/handoff-phase9` that includes this note (run manually by the user from the command Claude provided; merge via PR, docs only, no server update needed)
**Session status:** Handed off to next session
