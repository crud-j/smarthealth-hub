# Disk cleanup, smaller image, failed-sign-in fix and Reliability metrics are merged (#39–#42); #42 is NOT deployed yet: the VM auto-shut down mid-step

**Date:** 2026-11-20
**Status:** IN PROGRESS (#39, #40, #41 merged + deployed + verified live; **#42 merged, CI/Vercel green, backend NOT deployed**: the Azure VM's 23:00 Manila auto-shutdown powered it off at 15:01:45 UTC while the user was about to run `deploy.sh`)
**Bead(s):** none (`bd` CLI not installed on this PC)
**Epic:** Deploy SmartHealth Hub to production and harden it (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `9`
**Parent:** `HANDOFF_admin-security-settings-done_2026-11-20.md`
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > `HANDOFF_nfc-backups-done_2026-11-19.md` > `HANDOFF_phase9-system-health-done_2026-11-19.md` > `HANDOFF_phase10-admin-model-b-done_2026-11-19.md` > `HANDOFF_allergies-media-banner-done_2026-11-20.md` > `HANDOFF_sidebar-and-admin-next_2026-11-20.md` > `HANDOFF_admin-security-settings-done_2026-11-20.md` > this

> ⚠️ This repo is **PUBLIC**. This file deliberately contains no passwords, keys,
> email addresses, phone numbers, patient names/codes/addresses, TextBee device IDs,
> NFC signatures or chip serials. Never add them. (`+63917…` numbers in tests are
> fake test values; the `@example.invalid` / `test.example.com` emails are fake.)

---

## Stale References

Identifiers from the parent (seq 8) that changed on purpose this session:

- Parent said "**Confirm deployed commit is `687345d`**": it never was. The server was still on **`c14852e`** (#37) at session start: the #38 "deploy" had not pulled anything (server `origin/main` also showed `c14852e`). Fixed by the #39 deploy (`90a70b1`, which contains #38).
- `classify_disk` warning text "Free space soon (e.g. docker image prune -f)": now **"(e.g. docker builder prune -f)"** (`system_status_service.py`). `docker image prune -f` freed 0 B on this server.
- `backend/Dockerfile` `chown -R appuser:appuser /app`: now **`chown -R appuser:appuser /app/media`** only (#40).
- `scripts/deploy.sh` "never prunes": now has `cleanup()` + `KEEP_BUILD_CACHE=72h` (#39).
- `docker-compose.server.yml` "no logging limits": now `x-logging` anchor (json-file 10m × 3) on all 7 services (#39).
- `mfa_service.verify_otp(*, db, user_id, plain_code, purpose)`: gained **`ip_address: str | None = None`**; failures now commit (#41).
- Parent: "Local DB tests impossible": **wrong**. Docker Desktop is installed and starts in ~10 s; DEV-WORKFLOW §5 throwaway containers run the full suite (new memory `local_db_tests.md`).
- Parent "PR 3 — Reliability metrics" (one PR): became **two** PRs: #41 (bug fix the metrics depended on) + #42 (metrics).

## Since Last Handoff

- **Parent step 0 (server disk, "start with a cache, storage is hitting fast")**: measured → **build cache 6.8 GB** was the cause (not logs/backups/journal). Fixed by #39 (deploy.sh auto-prune + log caps) and #40 (Dockerfile chown, ~405 MB per build). Disk went **46% → 26% used** (13 G → 7.3 G).
- **Parent step 1 (verify #38 deploy)**: answered: #38 was NOT running (`c14852e`). Deployed via #39 deploy. User has not yet confirmed SMS template tabs in the browser (asked; not reported).
- **Parent step 2 (housekeeping)**: done: local `main` pulled; branches `fix/sms-templates-clarity`, `feat/editable-system-settings`, `chore/deploy-prune-build-cache`, `chore/dockerfile-smaller-image`, `fix/record-failed-signins`, `feat/reliability-metrics` deleted. Seq-8 handoff (never committed by the user) went into #39 as commit `d62ead3`.
- **Parent step 3 (PR 3 reliability metrics)**: investigation found a **real production bug**: failed sign-ins were never saved (`get_db` rollback). Fixed in **#41**, verified live (`LOGIN_FAILED` 0 → 2). Metrics shipped as **#42** (merged, not deployed).
- **Parent Open Q0 (what uses the disk)**: answered (table below). **Q1 (is 687345d running)**: answered: no. **Q2 (PR 3 thresholds)**: answered: user accepted defaults ("go, all defaults"). **Q3 (native-speaker review of Filipino SMS)**: still open.
- **Risks that materialized**: (a) the frontend-before-backend window again, now avoided in #42 by making `reliability` optional; (b) VM auto-shutdown at 23:00 cut the session before the #42 deploy.
- **Trajectory**: System Administration's 3-PR plan is complete in code. Only the #42 deploy + browser check remain; then defense-readiness items (user-only) and optional cleanups.

## Reference Documents

- `CLAUDE.md`: conventions: Admin model B, audit every write, Alembic-only schema changes, AES-256-GCM fields, module boundaries, PHI never on NFC/QR.
- `docs/SmartHealth_Hub_System_Development_Plan.md` (git-ignored, local): §11.7 "SMS delivery failure rate and OTP failure rate … Reliability ISO 25010" drove #42.
- `plans/handoffs/HANDOFF_admin-security-settings-done_2026-11-20.md` (parent): PR #35–#38 detail, API surface, backend role-guard map, Celery Beat schedule.
- `plans/handoffs/HANDOFF_phase9-system-health-done_2026-11-19.md`: original System Health internals.
- `DEV-WORKFLOW.md`: §5 local test DB via Docker (now proven to work), §6 `deploy.sh`, §9 server cheat sheet (prune row updated in #39).
- `DEPLOY.md:93`: `alias dc='docker compose -f docker-compose.server.yml --env-file .env.server'` (the alias exists on the server and worked this session).
- Claude memory: `deployment_setup.md`, `pnpm_not_npm.md`, `feedback_no_secret_screens.md`, `project_scaffold.md`, `feedback_ci_logs.md`, **new `local_db_tests.md`**.

## The Goal

SmartHealth Hub (thesis: Barangay Health Center records system with NFC/QR health cards, SMS reminders, OTP MFA) runs in production for the thesis defense: website `https://smarthealth-hub-two.vercel.app` (Vercel, auto-deploys on merge to `main`), API `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose, deployed by hand with `bash scripts/deploy.sh`). This session: (1) stop the server disk from filling up ("I want it to start with a cache, because the storage is hitting fast"), (2) finish the System Administration plan with PR 3: reliability metrics on System Health (SDP §11.7), which uncovered and fixed a failed-sign-in recording bug. Everything keeps Admin model B (admin never sees decrypted clinical PHI) and audits every write.

## Where We Are

### Production (at handoff)
- `origin/main` = **`074e03f`** (merge of #42). Local `main` = `074e03f`, only local branch.
- **Server is OFF** (Azure auto-shutdown 23:00 Manila; broadcast "The system will power off now!" at Fri 2026-11-20 15:01:45 UTC). `/health` → no response (curl 000).
- **Server code = `9700f20`** (#41) when it shut down. **#42 (`074e03f`) is NOT deployed.** The user had merged it and was "on the server part now".
- Vercel already serves the #42 frontend (`074e03f` status "success"). The page treats `reliability` as optional → the Reliability section is simply hidden until the backend is deployed; the rest of System Health works.
- CI on `074e03f`: pytest ✅, mypy ✅, lint backend ✅, lint frontend ✅, tsc ✅, frontend build ✅; **Build — Backend Docker Image was `in_progress`** at handoff: check it.
- Server disk after #40 deploy: **7.3 G used, 21 G free (26%)** of 29 G. Build cache 1.138 GB (412.1 MB reclaimable: the old 405.7 MB chown layer; auto-removed by deploy.sh once >72 h old).
- Backend image `smarthealth-backend:latest` = **725 MB** (was 1.13 GB). Deploy build time **3.0 s** for code-only changes (was 80.2 s).
- Production audit counts after #41 deploy: `LOGIN` 10, `LOGIN_FAILED` **2** (was 0), `OTP_SENT` 13, `PASSKEY_LOGIN` 19.

### Storage (#39, #40)
- `scripts/deploy.sh`: `KEEP_BUILD_CACHE=72h`; `cleanup()` runs after `compose up -d --build --wait` succeeds: `docker image prune -f` + `docker builder prune -f --filter "until=$KEEP_BUILD_CACHE"` (each `|| echo WARNING`), then prints `Disk: X used, Y free (Z% used)`. Verified running in the #40 deploy output.
- `docker-compose.server.yml`: `x-logging: &logging` (driver json-file, `max-size: "10m"`, `max-file: "3"`); `logging: *logging` on `x-backend` (backend/worker/beat) + caddy, db, redis, backup. Verified by parsing YAML: all 7 resolve.
- `backend/Dockerfile` runtime stage: `RUN mkdir -p /app/media/patient_photos /app/media/health_cards && sed … entrypoint.sh && chmod +x … && chown -R appuser:appuser /app/media` (+ comment why never `chown -R /app`). Verified on server: `media writable`.
- `DEV-WORKFLOW.md:265` cheat sheet: "Free disk (old build cache + untagged images; deploy.sh does this after every deploy) | `docker builder prune -f` · `docker image prune -f`".

### Failed sign-ins (#41)
- `backend/app/services/auth_service.py` `login()`: `await db.commit()` after each `LOGIN_FAILED` audit write (wrong_password / passkey_only_account, and account_disabled) before raising.
- `verify_otp_and_issue_tokens()` and `reset_password()` pass `ip_address=ip_address` to `mfa_service.verify_otp`.
- `backend/app/services/mfa_service.py`: imports `audit_service`; `verify_otp(..., ip_address=None)`; new `_record_failure(db, *, user_id, metadata, ip_address)` writes **`OTP_FAILED`** + `await db.commit()`. Reasons: `expired_or_missing` `{reason, purpose}`, `too_many_attempts` `{reason, purpose, attempt}`, `wrong_code` `{reason, purpose, attempt}`. Old `await db.flush()` before raise removed (commit replaces it).
- Docstrings: `audit_service.py` action list + `audit_log.py` list include `OTP_FAILED`.
- Tests: `backend/tests/test_signin_failure_records.py` (7 tests, `prod_client` fixture).

### Reliability metrics (#42, merged, not deployed)
- `backend/app/schemas/system_config.py`: `SmsWindow`, `SmsReliability`, `SignInWindow`, `SignInReliability`, `ReminderRun`, `ReminderRuns`, `ReliabilityChecks`; `SystemStatusResponse.reliability`.
- `backend/app/services/system_status_service.py`: thresholds, `_percent`, `classify_sms`, `classify_sign_in`, `count_sms`, `count_sign_ins`, `check_sms`, `check_sign_in`, `_parse_reminder_run`, `check_reminder_runs`; `collect_system_status` runs the three after `check_database` (sequential, same session); `overall` includes `sms.status` and `sign_in.status` (not reminders).
- `backend/app/workers/monitoring_tasks.py`: `REMINDER_RUN_KEY_PREFIX`, `REMINDER_JOBS`, `REMINDER_RUN_TTL_SECONDS`, `record_reminder_run(job, queued)` (sync redis, never raises).
- `backend/app/workers/reminder_scheduler.py`: imports `record_reminder_run`; `dispatch_appointment_reminders` / `dispatch_immunization_reminders` call it after `asyncio.run(...)`.
- `frontend/web/lib/reliability.ts` (types + wording) and `frontend/web/app/(dashboard)/settings/system-health/page.tsx` (Reliability section, three `HealthCard`s, `latestRun`, optional `reliability?` guard).
- Tests: `backend/tests/test_reliability_metrics.py` (26), `frontend/web/tests/lib/reliability.test.ts` (9).

### Tests / quality (end of session)
- Backend full suite locally (throwaway Postgres 18 + Redis 7): **450 passed in 119.19 s** (was 424 after #41; CI earlier reported ~380 + new).
- vitest: **129 passed, 16 files** (was 120 / 15).
- DB-free pytest baseline (`--noconftest`): 53 passed (unchanged; run at session start of #39 work).
- `ruff check app`, `ruff format --check app` (114 files), `mypy app --ignore-missing-imports` (114 files): clean. `tsc --noEmit` exit 0; `eslint` on changed files exit 0.

### Repo / PC state
- Uncommitted (never commit without asking): `README.md` (user's ssh line ~134), `backend/celerybeat-schedule-shm`, `backend/celerybeat-schedule-wal`, `START.md`, `dump.rdb`, `start-tunnel.ps1`. `stash@{0}` still present. Don't drop.
- **Docker Desktop is running** on the PC (started by Claude this session); test containers `shh-test-pg` / `shh-test-redis` are stopped (`--rm`, so removed).
- This handoff file (untracked) needs a docs commit (see Session Closed / Quick Start).

## What We Tried (Chronological)

1. **Onboarding (read-only).** Read parent; `bd` not installed. Read `deploy.sh`, `docker-compose.server.yml`, `system_status_service.py` (classify_disk 80/90%), plus adjacent `infra/backup/backup.sh` (refuses to run with < 1 GB free, `BACKUP_MIN_FREE_MB=1024`; retention only after success), `backend/Dockerfile`, `backend/.dockerignore`, `infra/caddy/Caddyfile`, `.github/workflows/deploy.yml` (an SSH auto-deploy workflow that runs `docker image prune -f`; evidently not deploying, since the server was 2 merges behind).
2. **Measured the server (user ran read-only commands).** Result: build cache 6.8 GB was the only real consumer; logs 728 KB, backups 14 MB, journal 40.9 MB. Also discovered the server was on `c14852e` (#38 never deployed). Proposed ONE plan: deploy, prune build cache, PR for auto-prune + log caps + doc text.
3. **#39 (deploy prune + log caps).** Branch `chore/deploy-prune-build-cache`. Verified: `bash -n`, YAML parse of all 7 services, DB-free pytest 53, disk tests 3 passed. 9 tests in `test_system_status.py` error under `--noconftest` (need `client` fixture): expected. Included the seq-8 handoff as a separate commit (it had never been committed).
4. **#39 deploy.** Build 80.2 s; `[runtime 11/11] RUN mkdir … chown -R appuser:appuser /app` **62.1 s**; the new `cleanup()` did **not** print. Cause: bash had the *old* deploy.sh open when `git pull` replaced the file (new inode), so the new steps apply from the next deploy. Manual `docker builder prune -f` freed only **422.2 MB**; build cache still went 6.8 GB → 1.131 GB, so ~5.3 GB vanished before the manual prune (likely BuildKit's own GC after the build; **not confirmed**). Disk 46% → 27%.
5. **Spotted chown layer in the build log** → #40: chown only `/app/media`. Verified first that nothing writes outside media: grep for `write_text|write_bytes|open(…w)|mkdir|.save(|tempfile|joblib|pickle|FileHandler|shutil.|touch|makedirs|unlink|MEDIA_DIR`: only `patient_photo_service.py` (media), `qr_service.py` (BytesIO), PDFs in memory (`write_pdf()` returns bytes), `scripts/backup_db.py` (legacy manual script, unused), `purge_stored_card_pdfs.py` (media). `XDG_CACHE_HOME=/tmp/.cache`, beat schedule `/tmp/celerybeat-schedule`, `PYTHONDONTWRITEBYTECODE=1`. Could not build locally (Docker Desktop was off then).
6. **#40 deploy.** Build **3.0 s**, step 11 **0.6 s**, image **1.13 GB → 725 MB**, `media writable`, cleanup printed `Disk: 7.3G used, 21G free (26% used)`. Only backend/worker/beat recreated (db/redis/caddy/backup untouched since their config didn't change).
7. **PR 3 investigation → found the bug.** Read `monitoring_tasks.py` (existing `check_sms_failure_rate` uses Redis counter `sms:failed_tasks:count`, 24 h TTL, threshold `_FAILURE_THRESHOLD=5`), `sms_log.py` (statuses queued/sent/failed/delivered/replied), `mfa_otp.py`, `auth_service.py`, `mfa_service.py`, `db/session.py`. `get_db` does `except Exception: await session.rollback(); raise`. `write_audit_log` only flushes. → `LOGIN_FAILED` and `attempt_count` lost on every failure. Asked the user to prove it on production: wrong password + audit count query → **no `LOGIN_FAILED` rows**.
8. **Local DB tests.** Handoff said impossible; found Docker CLI installed, daemon off → `Start-Process "…\Docker Desktop.exe"`, daemon up after 10 s, started DEV-WORKFLOW §5 containers.
9. **#41 TDD.** New `prod_client` fixture (get_db override that rolls back on error). First red run: 5 failed: 3 with `MissingGreenlet` (**my test bug**: a rollback expires ORM objects; reading `user.id` afterwards lazy-loads) and 2 real (`(0, False) != (1, False)`, `(5, False) != (6, True)`). Fixed tests to capture plain ids (a global `replace("user.id", "user_id")` broke `_user` itself → fixed by hand; `MfaOtp.id` is a server default → `flush()` before reading). Second red run: 5 failed, all for the right reasons. Implemented commit-before-raise → 20 passed (7 new + 13 `test_auth.py`), full suite **424 passed**. Grep heuristic found no other audit-write-then-raise paths.
10. **#41 deploy verified**: `LOGIN_FAILED` = 2 on production.
11. **#42 design accepted** ("go, all defaults"): SMS + Sign-in + Reminder runs cards, thresholds as proposed.
12. **#42 build.** Tests first (written before code but **not run red**: they would only have failed on imports; stated honestly to the user). Big heredoc in Bash failed (`unexpected EOF while looking for matching ''`, same gotcha as parent) → wrote `scratchpad/edit_status_service.py` and ran it. mypy flagged `Field(None, …)` as a required arg (no pydantic mypy plugin) → `Field(default=None, …)`. Result: 49 passed (new + status tests), full **450 passed**; vitest red (module missing) → 9 passed → 129 total.
13. **Deploy-gap fix in #42**: realised Vercel ships the page before `deploy.sh`, so `data.reliability.sms` would throw and break the entire System Health page → made `reliability?` optional + `{data.reliability && (…)}` guard. tsc/eslint still clean.
14. **User merged #42**, started server work, VM auto-shut down at 23:01 Manila → handoff.

## Key Decisions

- **Measure before cleaning.** The handoff listed four suspects; numbers showed only build cache mattered, so no change to `BACKUP_KEEP_DAYS` (14 MB) or journal (41 MB). Rejected: blanket `docker system prune` (too broad), anything with `--volumes` or `compose down -v` (DB/media/Redis live in named volumes).
- **Auto-prune in deploy.sh with a 72 h cache window** rather than full prune: keeps recent layers so the next deploy builds in seconds. Cleanup only after a healthy `--wait`, and never fails the deploy. Rejected: relying on `.github/workflows/deploy.yml` (not in use; only `image prune`, which frees nothing here).
- **Log caps via one YAML anchor** even though logs were tiny (728 KB). Cheap insurance for long periods without a deploy (defense period). Trade-off: the #39 deploy recreated all 7 containers once (a few seconds of downtime).
- **Deploy #38 together with #39** (one deploy) instead of deploying #38 first, so the DB container restarted once.
- **Dockerfile: chown only media** rather than `COPY --chown`: code + venv stay root-owned = read-only for appuser (least privilege), and no venv copy per build.
- **Split PR 3 into #41 (bug) + #42 (metrics)**: metrics would have shown 0 failures forever without the fix; the bug was also a security/audit gap on its own.
- **Commit-before-raise in the services** (rather than a separate audit session or an exception handler): nothing else is pending at those points, app and tests both use `expire_on_commit=False`, and a separate session would escape the test transaction (writes to real tables). Rejected: changing `get_db` (would affect every endpoint).
- **New `OTP_FAILED` action** (free-text column, no migration) instead of deriving failures from `mfa_otp.attempt_count` (only the latest row per user is "active"; rows get superseded).
- **Reliability counts from existing tables** (`sms_logs`, `audit_logs`) + Redis run markers, no migration. Rejected: a metrics table / time-series store.
- **Reminder runs = information only**: VM is off nightly/weekends, so staleness rules would warn every morning; heartbeat already covers a dead scheduler.
- **SMS red needs ≥ 4 finished messages**: one failure out of one is yellow, not red.
- **`reliability` optional on the frontend** because Vercel deploys before the backend.

## Evidence & Data

### PR / commit log (this session, all merged to `main`)
| PR | Branch | Commit(s) | Merge | Summary | Files | Deployed? |
|---|---|---|---|---|---|---|
| #39 | chore/deploy-prune-build-cache | `bf75ac6`, `d62ead3` (seq-8 handoff) | `90a70b1` | deploy.sh auto-prune, log caps, prune hint text | 4 + 1 | ✅ |
| #40 | chore/dockerfile-smaller-image | `494324c` | `732595d` | chown only /app/media | 1 (+5/−1) | ✅ |
| #41 | fix/record-failed-signins | `6992245` | `9700f20` | commit LOGIN_FAILED / OTP_FAILED + attempt_count before raise | 5 (1 new) | ✅ |
| #42 | feat/reliability-metrics | `cf82a9b` | `074e03f` | Reliability section (SMS, sign-in, reminder runs) | 8 (3 new) | ❌ **pending** |

### Server disk: before / after
| Measure | Session start | After #39 deploy + manual prune | After #40 deploy |
|---|---|---|---|
| `df -h /` used | 13 G (46%) | 7.6 G (27%) | **7.3 G (26%)** |
| `df -h /` avail | 16 G | 21 G | 21 G |
| Build cache | 84 entries, 6.804 GB (5.673 GB reclaimable) | 14 entries, 1.131 GB (0 B) | 18 entries, 1.138 GB (412.1 MB) |
| Images | 4, 1.689 GB (0 B reclaimable) | 4, 1.689 GB | 4, **1.288 GB** |
| Containers | 7, 94.21 kB | 7, 86.02 kB | 7, 86.02 kB |
| Local volumes | 6, 75.09 MB | 6, 75.18 MB | 6, 75.24 MB |
| `/var/lib/docker/containers` | 728 K | n/a | n/a |
| `/var/backups/smarthealth` | 14 M | n/a | n/a |
| `/var/log` / journal | 46 M / 40.9 M | n/a | n/a |

### Backend image + build time
| | Before #40 | After #40 |
|---|---|---|
| Image ID | `cc52a696cf90` | `979739073dfc` |
| Disk usage / content size | 1.13 GB / 253 MB | **725 MB / 168 MB** |
| Whole build (code-only change) | 80.2 s | **3.0 s** |
| `[runtime 11/11] RUN mkdir … chown` | 62.1 s | **0.6 s** |
| exporting to image | 15.0 s | 0.6 s |
| Build-cache entry per deploy | ~405.7 MB | a few MB |

### #39 manual `docker builder prune -f` output (sizes)
405.7 MB (12 min ago), 9.698 MB, 6.328 MB, 226.1 kB, 219.3 kB, 13.5 kB, 12.85 kB, 12.29 kB, 8.192 kB → **Total 422.2 MB**.

### Production audit counts (`audit_logs`, actions LOGIN*, OTP_SENT)
| Action | Before #41 (after a deliberate wrong password) | After #41 deploy + wrong password |
|---|---|---|
| LOGIN | 10 | 10 |
| LOGIN_FAILED | **— (0 rows)** | **2** |
| LOGIN_TRUSTED_DEVICE | — | — |
| OTP_SENT | 13 | 13 |
| PASSKEY_LOGIN | 19 | 19 |

Query used (read-only, counts only):
```bash
dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT action, count(*) FROM audit_logs
WHERE action IN ('LOGIN','LOGIN_FAILED','LOGIN_TRUSTED_DEVICE','PASSKEY_LOGIN','OTP_SENT')
GROUP BY action ORDER BY action;
SQL
```

### #41 red → green
| Test | Red run 1 | Red run 2 (tests fixed) | After fix |
|---|---|---|---|
| test_wrong_password_is_recorded | MissingGreenlet (test bug) | `0 == 1` rows | ✅ |
| test_disabled_account_is_recorded | MissingGreenlet | `[] == [{'reason': 'account_disabled'}]` | ✅ |
| test_unknown_email_writes_nothing | ✅ | ✅ | ✅ |
| test_wrong_otp_counts_the_attempt_and_is_recorded | `(0, False) == (1, False)` | same | ✅ |
| test_otp_lockout_is_kept | `(5, False) == (6, True)` | same | ✅ |
| test_expired_or_missing_otp_is_recorded | MissingGreenlet | `[] == ['expired_or_missing']` | ✅ |
| test_right_otp_still_logs_in | ✅ | ✅ | ✅ |

### Test count history
| Point | Backend full (local) | vitest | DB-free pytest |
|---|---|---|---|
| Session start | n/a (not runnable then) | 120 | 53 |
| #39/#40 | n/a | 120 | 53 |
| #41 | **424 passed** (108.18 s) | 120 | 53 |
| #42 | **450 passed** (119.19 s); reliability+status 49 passed (6.03 s) | **129** (16 files) | 53 |

### CI status per merge commit
| Commit | pytest | mypy | lint BE | lint FE | tsc | FE build | Docker build | Vercel |
|---|---|---|---|---|---|---|---|---|
| `90a70b1` (#39) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `732595d` (#40) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (finished later) | ✅ |
| `9700f20` (#41) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `074e03f` (#42) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **in_progress at handoff** | ✅ |

### Reliability thresholds (#42, accepted as defaults)
| Card | Window | Yellow | Red | Feeds overall? |
|---|---|---|---|---|
| SMS delivery | 24 h (7 d shown) | `failed >= 5` OR (`failed > 0` AND `pct >= 10`) OR `stuck > 0` | `finished >= 4` AND `pct >= 25` | yes |
| Sign-in | 24 h (7 d shown) | `LOGIN_FAILED + OTP_FAILED >= 20` | `>= 50` | yes |
| Reminder runs | latest per job | never | never | no |
| any | no activity in 7 d | → `unknown` | | (severity 0) |

### Live checks this session
| Check | Result |
|---|---|
| `/health` (after each deploy) | 200 in 0.29–0.31 s |
| `/system/settings` anonymous | 401 |
| `media writable` exec test | ✅ |
| Server `git log -1` after #39 / #40 | `90a70b1` / `732595d` |
| `/health` at handoff | 000 (VM off) |

## Code Analysis

- **`get_db`** (`app/db/session.py:60-79`): `async with AsyncSessionLocal() as session: try: yield session / except Exception: await session.rollback(); raise / finally: close`. FastAPI throws endpoint exceptions (incl. custom `UnauthorizedError`) into the dependency, so **anything only flushed before a raise is lost**. `AsyncSessionLocal` has `expire_on_commit=False`.
- **Test fixtures** (`tests/conftest.py:186-265`): `db_session` = connection-level outer transaction + `begin_nested()` savepoint, session bound with `expire_on_commit=False`, `after_transaction_end` listener restarts the savepoint after commit. `client` overrides `get_db` with `yield db_session` (**no rollback**). `prod_client` (in `test_signin_failure_records.py`) adds the rollback; after `db_session.rollback()` ORM objects are expired → read only plain values.
- **Rate limit vs OTP lockout**: `/auth/verify-otp` is limited to 5 per `verify_otp:{ip}:{user_id}` per 900 s; OTP lockout triggers when `attempt_count > MAX_OTP_ATTEMPTS (5)`, i.e. the 6th try, so from one IP the limiter answers 429 first; the lockout matters across IPs. `OTP_EXPIRY_MINUTES=10`.
- **`system_status_service.py` constants**: `HEARTBEAT_WARN_SECONDS=150`, `DISK_WARN_PERCENT=80.0`, `DISK_ERROR_PERCENT=90.0`, `BACKUP_WARN_HOURS=26.0`, `BACKUP_ERROR_HOURS=50.0`, `SMS_WARN_FAILED=5`, `SMS_WARN_PERCENT=10.0`, `SMS_ERROR_PERCENT=25.0`, `SMS_ERROR_MIN_FINISHED=4`, `SMS_STUCK_MINUTES=60`, `SIGNIN_WARN_FAILURES=20`, `SIGNIN_ERROR_FAILURES=50`, `_SMS_SENT_STATUSES=("sent","delivered","replied")`, `_SIGNIN_SUCCESS_ACTIONS=("LOGIN","LOGIN_TRUSTED_DEVICE","PASSKEY_LOGIN")`.
- **`count_sms(db, *, since, now) -> SmsWindow`**: one `select(func.count().filter(...)×3).where(SmsLog.created_at >= since)`; stuck = `status == "queued" AND created_at < now - 60 min`. `failure_percent = _percent(failed, sent+failed)`; `_percent` caps at 100 and rounds to 1 decimal.
- **`count_sign_ins(db, *, since) -> SignInWindow`**: `select(AuditLog.action, func.count()).where(created_at >= since, action IN _SIGNIN_ACTIONS).group_by(action)`; `otp_verified = LOGIN` (only written after a correct OTP; passkey/trusted-device have their own actions); `otp_success_percent = _percent(LOGIN, OTP_SENT)`. Forgot-password writes `PASSWORD_RESET_REQUESTED`, not `OTP_SENT`; resend-OTP writes `OTP_SENT`.
- **`check_reminder_runs()`** reads `reminders:last_run:{appointment|immunization}` via `get_shared_redis()`; malformed JSON → run with `last_run_at=None`; status `ok` if any run recorded else `unknown`; Redis error → logged, treated as none.
- **`record_reminder_run(job, queued)`** (`monitoring_tasks.py`): `redis_lib.from_url(settings.REDIS_URL, decode_responses=True)`, `set(key, json.dumps({"at": iso, "queued": n}), ex=2_592_000)`, swallows exceptions with a warning.
- **Existing hourly alert** `monitoring.check_sms_failure_rate` (Beat :30) reads Redis counter `sms:failed_tasks:count` (incremented in `sms_tasks.py:275/390` on_failure, 24 h TTL); sends admin SMS at ≥ 5 if `ADMIN_ALERT_PHONE` set. Independent of the new card (which reads `sms_logs`).
- **Frontend** `lib/reliability.ts`: `smsHeadline` ("No SMS" / "N waiting" / "X% failed"), `smsLine(label, w)` ("24 h: 3 sent · 1 failed · 1 waiting over 1 h"), `signInHeadline` ("12 sign-ins"), `signInLine` ("24 h: 1 wrong password · 3 wrong OTP codes · OTP success 75%"), `reminderLine` ("Appointment (hourly): Nov 20, 3:00 PM · 2 SMS" / "…: not recorded yet"), `formatManila` (en-PH, Asia/Manila).
- **deploy.sh gotcha**: a running bash script keeps reading the old file after `git pull` replaces it, so changes to `deploy.sh` take effect on the deploy *after* the one that pulls them.

### API surface changed this session
| Method | Path | Auth | Change |
|---|---|---|---|
| GET | `/api/v1/system/status` | Admin | + `reliability: {sms, sign_in, reminders}` (#42); `disk.message` hint text (#39) |
| POST | `/api/v1/auth/login` | public | wrong password / disabled account now persist `LOGIN_FAILED` (#41); response unchanged |
| POST | `/api/v1/auth/verify-otp` | public | wrong/expired/locked OTP persist `attempt_count` + `OTP_FAILED` (#41); response unchanged |
| POST | `/api/v1/auth/reset-password` (OTP purpose `password_reset`) | public | same OTP failure recording (#41) |

Example `reliability` payload shape (counts only):
```json
{"sms": {"status": "warning", "message": "...", "last_24h": {"sent": 48, "failed": 5, "stuck": 0, "failure_percent": 9.4}, "last_7d": {...}},
 "sign_in": {"status": "ok", "message": "...", "last_24h": {"successful": 4, "failed_password": 1, "failed_otp": 0, "otp_sent": 3, "otp_verified": 2, "otp_success_percent": 66.7}, "last_7d": {...}},
 "reminders": {"status": "unknown", "message": "...", "runs": [{"job": "appointment", "last_run_at": null, "queued": null}, {"job": "immunization", "last_run_at": null, "queued": null}]}}
```

### Timeline (user prompt → outcome)
| # | User said | Outcome |
|---|---|---|
| 1 | Paste prompt (seq 8) + "wait for my go-ahead" | Onboarding; read deploy.sh, compose, status service, backup.sh, Dockerfile, .dockerignore, Caddyfile, deploy.yml; proposed read-only server measurement |
| 2 | Pasted `git log`, `df`, `docker system df`, `du`, journal | Build cache 6.8 GB = cause; server on `c14852e` (#38 never deployed); proposed deploy + prune + PR B |
| 3 | "go, all defaults" | #39 built (deploy.sh cleanup, log caps, hint text) + seq-8 handoff commit |
| 4 | "merged and deployed, check it" + deploy log | 46% → 27%; cleanup didn't run (old script in memory); found 62 s chown step → proposed #40 |
| 5 | "go, all defaults" | #40 built (chown media only), write-path audit |
| 6 | Deploy log + image sizes + `media writable` | 1.13 GB → 725 MB, 80 s → 3 s; started PR 3 investigation; found LOGIN_FAILED / attempt_count rollback bug; asked for proof query |
| 7 | Pasted audit counts (no LOGIN_FAILED) | Bug confirmed; started Docker Desktop; #41 TDD; full suite 424 |
| 8 | "merged and deployed, check it" + counts (LOGIN_FAILED 2) | Verified; proposed #42 design with thresholds |
| 9 | "go, all defaults" | #42 built; full suite 450, vitest 129; added deploy-gap guard |
| 10 | "/handoff now" + VM power-off broadcast; "#42 merged, I'm on the server part now" | This file |

### Tooling gotchas (cost time this session)
- **Bash tool heredoc with a big Python block** fails (`unexpected EOF while looking for matching ''`), same as parent. Write the script to the scratchpad with Write and run `python <file> <target>` (pattern: `scratchpad/edit_status_service.py` with a `rep(old, new)` helper asserting exactly one match).
- **PowerShell `cd` persists** between calls in this harness: `cd backend` when already in `backend` → "Cannot find path …\backend\backend". Check the working-directory notice before `cd`.
- **`Select-String -Recurse`** doesn't exist in Windows PowerShell 5.1 → use Grep tool or `grep -rn` in Bash.
- **No Prettier in `frontend/web`** (`pnpm exec prettier` → not found). Use `pnpm exec tsc --noEmit`, `pnpm exec eslint <files>`, `pnpm exec vitest run`.
- **`pnpm run lint`** prints many pre-existing `react-hooks/set-state-in-effect` warnings in other files; lint only changed files to see your own findings.
- **mypy without the pydantic plugin**: `Field(None, description=…)` is treated as required → write `Field(default=None, …)`.
- **Global string replace in test refactors** can hit the helper itself (`user.id` → `user_id` inside `_user` produced `user_id, email = user_id, email`). Re-read after scripted edits.
- **After `session.rollback()` every loaded ORM object is expired** (regardless of `expire_on_commit`): in async tests reading `obj.id` afterwards raises `MissingGreenlet`. Capture plain values before the request.
- **`server_default` UUID PKs** (e.g. `MfaOtp.id`) are `None` until `flush()`.
- **`git add --dry-run`** confirmed file counts for every PR (4+1, 1, 5, 8).
- **Running bash script + `git pull` of that script**: new logic applies one deploy later.

### Commands that worked
```bash
# Server (user runs, from /opt/smarthealth-hub)
docker system df ; df -h / ; sudo du -sh /var/lib/docker/containers /var/backups/smarthealth /var/log ; sudo journalctl --disk-usage
docker builder prune -f            # build cache only; never touches volumes
docker image ls smarthealth-backend
dc exec backend sh -c 'touch /app/media/.w && rm /app/media/.w && echo media writable'
dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL' ... SQL   # read-only counts
# PC
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"   # daemon up in ~10 s
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/<sha>/check-runs"
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/<sha>/status"   # Vercel
python -c "import yaml; ..."  # parse docker-compose.server.yml to check per-service logging
bash -n scripts/deploy.sh
```

## Files Changed

### Source code
- `scripts/deploy.sh` (#39): header step 4, `KEEP_BUILD_CACHE`, `cleanup()`, call after `compose ps` on success.
- `docker-compose.server.yml` (#39): `x-logging` anchor + `logging: *logging` on x-backend, caddy, db, redis, backup.
- `backend/Dockerfile` (#40): chown only `/app/media` + explanatory comment.
- `backend/app/services/system_status_service.py` (#39 hint text; #42 reliability).
- `backend/app/services/auth_service.py` (#41): commits in `login()`, `ip_address` to both `verify_otp` calls.
- `backend/app/services/mfa_service.py` (#41): `ip_address` param, `_record_failure`, docstring.
- `backend/app/services/audit_service.py`, `backend/app/models/audit_log.py` (#41): docstrings list `OTP_FAILED`.
- `backend/app/schemas/system_config.py` (#42): reliability models.
- `backend/app/workers/monitoring_tasks.py` (#42): run markers + `record_reminder_run`.
- `backend/app/workers/reminder_scheduler.py` (#42): call `record_reminder_run`.
- `frontend/web/lib/reliability.ts` (#42, new).
- `frontend/web/app/(dashboard)/settings/system-health/page.tsx` (#42): Reliability section.

### Tests
- `backend/tests/test_signin_failure_records.py` (#41, new, 7 tests).
- `backend/tests/test_reliability_metrics.py` (#42, new, 26 tests incl. parametrized).
- `frontend/web/tests/lib/reliability.test.ts` (#42, new, 9 tests).

### Docs
- `DEV-WORKFLOW.md:265` (#39) prune row.
- `plans/handoffs/HANDOFF_admin-security-settings-done_2026-11-20.md` (committed in #39 as `d62ead3`).
- This handoff.

### Claude memory
- New `memory/local_db_tests.md` + index line in `MEMORY.md`.

### Scratchpad (session-only, `C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\92acd2bd-6240-4719-b273-45c8276ce40f\scratchpad\`)
`commit-deploy-prune.txt`, `pr-body-deploy-prune.md`, `commit-handoff-seq8.txt`, `commit-dockerfile-chown.txt`, `pr-body-dockerfile-chown.md`, `commit-record-failed-signins.txt`, `pr-body-record-failed-signins.md`, `commit-reliability-metrics.txt`, `pr-body-reliability-metrics.md`, `edit_status_service.py` (the scripted multi-replace used for #42; reusable pattern), `commit-handoff-seq9.txt` (for this handoff).

## User Feedback & Preferences (REQUIRED)

- **"go, all defaults"** (3× this session: storage PR #39, Dockerfile PR #40, reliability #42): accept the single recommendation and build; don't re-ask.
- **"merged and deployed, check it"** (3×) + pasted server output: verify with `git fetch`, GitHub check-runs, Vercel status, `/health`, and the pasted numbers; answer with before/after tables.
- **Pasting proof instead of saying "go"**: after the audit query showed 0 `LOGIN_FAILED`, the user pasted only the output; Claude proceeded to #41 and the user merged it without objection. Read a pasted confirmation of a proposed check as consent to proceed with the proposed next PR.
- **Storage first**: "I want it to start with a cache, because the storage is hitting fast" (from parent close): honored as step 0.
- **User commits/pushes/merges/deploys themselves.** Give exact `git add -- <paths>` (quote paths with `()`), `git commit -F <scratchpad file>`, compare URL, PR-body path, expected "N files changed" (verified with `git add --dry-run`). All counts were right this session.
- **Server commands** always prefixed with `cd /opt/smarthealth-hub`; user runs them and pastes output (prompt `azureuser@smarthealth-server:/opt/smarthealth-hub$`). `dc` alias available.
- **Reads PR bodies in the IDE** before posting (selected the scratchpad PR-body files each time).
- **Wants long sessions split via handoffs**: "/handoff now … so I can continue this session on a fresh session tomorrow, and I already merged, I'm on the server part now."
- (Carried) Clear, non-technical admin UI; screenshots everything; never put secrets or patient details in output; never send them into nano/cat on `.env` files; repo is public.

## Where We're Going

0. **START HERE: turn the VM on and deploy #42.** Azure portal → Virtual machines → `smarthealth-server` → **Start** (~1 min; auto-shutdown is 23:00 Manila). Then on the server:
   ```bash
   cd /opt/smarthealth-hub
   bash scripts/deploy.sh
   git log --oneline -1          # expect 074e03f (or later)
   ```
   Expect: code-only build (~3 s plus the `uv`/apt layers cached), `==> Freeing disk space` + `Disk:` line, `OK: commit 074e03f is running`. Also check from the PC that CI "Build — Backend Docker Image" on `074e03f` finished green:
   `curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/074e03f/check-runs"`.
1. **Browser check (admin)**: Settings → System Health → new **Reliability** section shows SMS delivery / Sign-in / Reminder runs. Expected right after deploy: Sign-in shows the real counts (≥ 2 wrong passwords in 7 d from today's tests); SMS shows whatever `sms_logs` has (yellow/red is plausible because the gateway SIM has no load); Reminder runs "Not recorded yet" until the next :00 hourly run, then "Appointment (hourly): <time> · N SMS". Ask for a screenshot. Version card should show `074e03f`. Also (carried from parent) confirm System Configuration → SMS templates show English/Filipino tabs and no "…"/"Too long" in the appointment preview.
2. **Commit this handoff** via a docs branch (commands in Session Closed). Optional: `docker builder prune -f` on the server (412 MB; auto-removed after 72 h anyway).
3. **If any Reliability card looks wrong**, adjust thresholds (constants at top of `system_status_service.py`) or wording (`lib/reliability.ts`). TDD with local Docker DB (memory `local_db_tests.md`).
4. **Defense readiness (user-only, remind once)**: load gateway SIM + test SMS; write final NTAG215 from demo patient's Print page; deactivate allergy test patient; regenerate demo card PDFs; re-enter house/street for demo patients registered before 2026-11-20; optionally customise SMS templates / clinic name on System Configuration; have the Filipino SMS wording reviewed.
5. **Optional cleanups (ask first)**: include `OTP_FAILED` in `audit_anomaly_service.check_login_failure_burst` (currently LOGIN_FAILED only, > 10 per IP); decide fate of `.github/workflows/deploy.yml` (auto-deploy that apparently doesn't run/succeed); `setex` in `mfa_service.py:~145` and `passkey_service.py:99`; `asyncio_default_fixture_loop_scope` in pyproject; `datetime.utcnow()` / `HTTP_422_UNPROCESSABLE_ENTITY` deprecations; old ruff findings in `tests/conftest.py` / `test_patients.py` / `test_health_cards.py`; empty `app/(dashboard)/users/` dir; `SMS_TEMPLATES` mentions in two docstrings; legacy `backend/scripts/backup_db.py`.

## Risks & Blockers

- **#42 backend not deployed**: until `deploy.sh`, the Reliability section is hidden (by design) and reminder runs are not recorded. No breakage expected (frontend guard), but the feature isn't live.
- **VM auto-shutdown 23:00 Manila** ends server work abruptly; plan deploys earlier in the evening. Backups at 22:30 run before shutdown.
- **CI Docker build on `074e03f` unconfirmed** (in progress at handoff).
- **SMS card may read red/yellow** because the gateway SIM has no load. That's accurate, not a bug; the card text says only gateway-reported failures are counted, and "sent" may still be reported for undelivered SMS.
- **Frontend-before-backend window** remains for any future backend-touching PR: keep new response fields optional on the frontend, or tell the user to deploy right after merging.
- (Carried) `POSTGRES_PASSWORD`/`ENCRYPTION_KEY` not rotated; old backups contain 2 deleted card PDFs until ~2026-12-04; CI logs unreadable by Claude (user pastes).

## Open Questions

1. Did the CI Docker build on `074e03f` pass? (Check first; no code change expected.)
2. Does the Reliability section look right with real production data (thresholds, wording)? Needs the user's screenshot.
3. What freed ~5.3 GB of build cache before the manual prune during the #39 deploy (BuildKit GC?). Not important now; disk is at 26%.
4. Is `.github/workflows/deploy.yml` running and failing on every CI success, or skipped? (Server was 2 merges behind before this session, so it isn't deploying.) Ask before touching.
5. (Carried) Filipino SMS wording native-speaker review before the defense?

## Quick Start for Next Session

```bash
# Reference docs
cat plans/handoffs/HANDOFF_reliability-done-deploy-pending_2026-11-20.md
cat CLAUDE.md
# Parent: plans/handoffs/HANDOFF_admin-security-settings-done_2026-11-20.md

# Key files (explore adjacent code too)
backend/app/services/system_status_service.py   # reliability: thresholds, count_*, classify_*, check_reminder_runs
backend/app/workers/monitoring_tasks.py          # record_reminder_run, heartbeat, check_sms_failure_rate
backend/app/services/mfa_service.py              # verify_otp + _record_failure (OTP_FAILED)
frontend/web/app/(dashboard)/settings/system-health/page.tsx
scripts/deploy.sh                                # cleanup() after successful deploy

# Verify current state (PowerShell on PC)
git fetch --prune; git switch main; git pull; git log --oneline -3     # expect 074e03f (+ handoff docs merge)
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health  # 000 until the VM is started
cd frontend/web; pnpm exec vitest run                                    # expect 129 passed
# Full backend suite locally (Docker Desktop must run; memory local_db_tests.md):
#   docker run -d --rm --name shh-test-pg -e POSTGRES_USER=shh_test -e POSTGRES_PASSWORD=shh_test -e POSTGRES_DB=smarthealthhub_test -p 127.0.0.1:5499:5432 postgres:18-alpine
#   docker run -d --rm --name shh-test-redis -p 127.0.0.1:6399:6379 redis:7-alpine
#   cd backend; $env:DATABASE_URL="postgresql+asyncpg://shh_test:shh_test@127.0.0.1:5499/smarthealthhub_test"; $env:REDIS_URL="redis://127.0.0.1:6399/0"; python -m pytest -p no:warnings   # expect 450 passed
#   docker stop shh-test-pg shh-test-redis

# Next action
# Ask the user to Start the VM, run `cd /opt/smarthealth-hub && bash scripts/deploy.sh`, paste the output,
# then screenshot Settings > System Health (Reliability section + Version 074e03f).
```

## Session Closed
**Closed at:** 2026-11-20 23:1x (Manila, UTC+8), right after the VM auto-shutdown
**Commit:** the `session: reliability-done-deploy-pending [standalone-9d299342]` commit on branch `docs/handoff-seq9` that includes this note (run by the user from the commands Claude provided; merge via PR, docs only, no server update needed)
**Session status:** Handed off to next session
