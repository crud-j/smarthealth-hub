# #42 deployed + verified; immunization catch-up, brute-force alert, new OTP email and OTP-not-in-logs shipped (#43–#46); next: role-based dashboards (2 user decisions pending)

**Date:** 2026-11-21
**Status:** IN PROGRESS (all 4 PRs merged, CI green, deployed by the user; role-based dashboard work not started: waiting on 2 user decisions + layout sketches)
**Bead(s):** none (`bd` CLI not installed on this PC)
**Epic:** Deploy SmartHealth Hub to production and harden it (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `10`
**Parent:** `HANDOFF_reliability-done-deploy-pending_2026-11-20.md`
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > `HANDOFF_nfc-backups-done_2026-11-19.md` > `HANDOFF_phase9-system-health-done_2026-11-19.md` > `HANDOFF_phase10-admin-model-b-done_2026-11-19.md` > `HANDOFF_allergies-media-banner-done_2026-11-20.md` > `HANDOFF_sidebar-and-admin-next_2026-11-20.md` > `HANDOFF_admin-security-settings-done_2026-11-20.md` > `HANDOFF_reliability-done-deploy-pending_2026-11-20.md` > this

> ⚠️ This repo is **PUBLIC**. This file deliberately contains no passwords, keys,
> email addresses, phone numbers, patient names/codes/addresses, TextBee device IDs,
> NFC signatures or chip serials. Never add them. The user's screenshots this session
> showed real-looking demo patient names and mobile numbers in the SMS log: they are
> NOT reproduced here and must never be. (`203.0.113.7/.8` in tests are RFC 5737
> documentation IPs; `@example.invalid` / `@test.example.com` emails are fake.)

---

## Stale References

Identifiers from the parent (seq 9) that changed on purpose this session:

- `existing_today_subq` (reminder_scheduler immunization query): **removed** in #44 → now `already_reminded_subq` (any day, not just today).
- `target_date` in `_dispatch_immunization_reminders_async`: **replaced** by `last_due_date` (window `today .. today+lead_days`); log extra key `"target_date"` → `"due_date"`.
- `Immunization.status != "completed"` filter: now **`Immunization.status == "scheduled"`** (#44).
- `check_login_failure_burst` "> 10 LOGIN_FAILED in 5 minutes": now **`LOGIN_BURST_WINDOW = timedelta(hours=1)`, `LOGIN_BURST_THRESHOLD = 20`, actions `("LOGIN_FAILED", "OTP_FAILED")`** (#45).
- Parent's "Next action: Ask the user to Start the VM, run deploy.sh" → done; server is on `4d2d587` (user said "merged and deployed" after #46).
- celery_app.py comment "Celery Beat never re-runs a job whose time passed while it was down": **wrong, corrected** in #45 (see Key Decisions / Code Analysis).
- email_service subjects "SmartHealth Hub — Your Verification Code" / "— Password Reset Code": now **"Your SmartHealth Hub sign-in code" / "Your SmartHealth Hub password reset code"** (`_otp_subject`).
- Parent "Optional cleanups: include OTP_FAILED in audit_anomaly_service.check_login_failure_burst": **done** (#45). Parent "decide fate of .github/workflows/deploy.yml": answered (it is `disabled_manually`), file still present.
- I (Claude) wrongly assumed `settings.is_production` exists: it does **not**. Production checks are `settings.ENVIRONMENT == "production"` (config.py:78 is `nfc_signed_links_required`).

## Since Last Handoff

- **Parent step 0 (start VM, deploy #42)**: done. VM was already on (`/health` 200 at session start). First deploy attempt was run on the **PC** in PowerShell (`bash scripts/deploy.sh` → `set: pipefail\r: invalid option name`: CRLF checkout). Re-run on the server: `074e03f → bd652a4`, build 1.7 s all CACHED, `Disk: 7.3G used, 21G free (26% used)`, `OK: commit bd652a4 is running.`
- **Parent step 1 (browser check)**: done. Reliability section visible and correct (numbers below). SMS templates tabs confirmed (English/Filipino, 134 chars, 1 SMS, no "…"/"Too long") → carried item closed.
- **Parent step 2 (commit handoff seq 9)**: done as PR #43 (`9c75f44`, merge `bd652a4`).
- **Parent step 3 (adjust reliability thresholds if wrong)**: not needed; all cards read correctly.
- **Parent step 5 optional cleanups**: OTP_FAILED in brute-force alert done (#45, plus a bigger bug: 5-min window vs hourly scan). deploy.yml answered (disabled). `.gitattributes` added (#44).
- **New work driven by findings**: #44 immunization reminder catch-up (motivated by the new Reminder-runs card; my first explanation of "today was skipped" was WRONG and corrected); #45 new OTP email design (user request, reference screenshot); #46 OTP codes out of production logs (security finding) + tests no longer send real email/SMS (found while testing #46).
- **Open questions answered**: Q1 CI Docker build on `074e03f` ✅; Q2 Reliability section looks right ✅; Q4 deploy.yml = `disabled_manually` (2 skipped runs on 2026-09-30). Q3 (what freed 5.3 GB build cache) still unknown, irrelevant. Q5 Filipino SMS native review still open.
- **Trajectory shift**: user now wants **role-based dashboards** (Physician vs BHW are "different users"). Supplied an AI-generated spec `C:\Users\githu\Downloads\smarthealth-hub-dashboard-content.md`; Claude reviewed it (keep/cut list below). Next session builds it after 2 decisions.

## Reference Documents

- `CLAUDE.md`: conventions (Admin model B, audit every write, Alembic-only schema changes, AES-256-GCM fields incl. `visits.diagnosis` / `treatment_notes`, module boundaries, PHI never on NFC/QR).
- `docs/SmartHealth_Hub_System_Development_Plan.md` (git-ignored, local): authoritative scope. Analytics dashboard + RBAC requirements.
- `plans/handoffs/HANDOFF_reliability-done-deploy-pending_2026-11-20.md` (parent): #39–#42 detail, reliability thresholds, deploy.sh cleanup, failed-sign-in fix.
- `DEV-WORKFLOW.md`: §5 local test DB via Docker, §6 `deploy.sh`, §9 server cheat sheet.
- `C:\Users\githu\Downloads\smarthealth-hub-dashboard-content.md` (user's file, outside repo): AI-generated role dashboard spec. Has an "AI responses may include mistakes" footer. Reviewed this session.
- Claude memory: `deployment_setup.md`, `local_db_tests.md` (updated this session), `pnpm_not_npm.md`, `feedback_no_secret_screens.md`, `project_scaffold.md`, `feedback_ci_logs.md`.

## The Goal

SmartHealth Hub (thesis: Barangay Health Center records system with NFC/QR health cards, SMS reminders, OTP MFA) runs in production for the thesis defense: website `https://smarthealth-hub-two.vercel.app` (Vercel, auto-deploys on merge to `main`), API `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose, deployed by hand with `bash scripts/deploy.sh` **on the server**). This session finished deploying the Reliability metrics, then hardened reminders and sign-in (immunization catch-up, brute-force alert, OTP email redesign, no OTP in production logs). The next goal is **role-based dashboards**: today every role sees the identical clinic-wide dashboard; the user wants Physician and BHW (and by extension Admin / Admin staff) to see content matching their job, without breaking Admin model B or the "no PHI text on the dashboard" principle.

## Where We Are

### Production
- `origin/main` = **`4d2d587`** (merge of #46). Local `main` = `4d2d587`, the only local branch (all session branches deleted after merge).
- CI on `4d2d587`: pytest ✅, mypy ✅, lint BE ✅, lint FE ✅, tsc ✅, FE build ✅, Docker build ✅; Vercel ✅. `/health` 200 in 0.32 s.
- User said "I have merged and deployed" after #46, so the server should be on `4d2d587`. **Not independently verified** (`/health` does not expose the commit; System Health → Version card does). Earlier verified: `bd652a4` via screenshot.
- Server disk after the `bd652a4` deploy: **7.3 G used, 21 G free (26%)**, unchanged since #40.
- The new OTP email has **not been seen by the user in a real inbox yet** (asked twice for a screenshot; not provided).

### Immunization reminders (#44)
- `backend/app/workers/reminder_scheduler.py`:
  - `manila_today(now: datetime | None = None) -> date`: `(now or datetime.now(tz=UTC)).astimezone(ZoneInfo("Asia/Manila")).date()`.
  - `_MANILA_TZ = ZoneInfo("Asia/Manila")`, `_REMINDED_STATUSES = ("queued", "sent", "delivered", "replied")`.
  - `_dispatch_immunization_reminders_async(today: date | None = None) -> int`: picks `Immunization.status == "scheduled"`, `next_due_date BETWEEN today AND today + lead_days`, patient has mobile, not opted out, `NOT EXISTS sms_log(immunization_id = Immunization.id, status IN _REMINDED_STATUSES)` (any day). `failed` reminders are retried at the next run.
  - Log extra `"due_date": str(immunization.next_due_date)`.
- `backend/app/workers/celery_app.py`: immunization beat comment rewritten (twice: #44, corrected in #45).
- Message text, 10:00 schedule, admin lead-days setting (`sms_immunization_lead_days`, 0–30, default 3), appointment reminders: unchanged.

### Brute-force alert (#45, commit `8b3b7d6`)
- `backend/app/services/audit_anomaly_service.py`: `LOGIN_BURST_WINDOW = timedelta(hours=1)`, `LOGIN_BURST_THRESHOLD = 20`, `_SIGNIN_FAILURE_ACTIONS = ("LOGIN_FAILED", "OTP_FAILED")`; `check_login_failure_burst` groups by `ip_address` (NOT NULL), `HAVING count > 20`; detail `"IP {ip} had {n} failed sign-ins in the last hour"`; `check_name` still `login_failure_burst`, severity HIGH.
- `backend/app/workers/audit_tasks.py`: docstring line updated. The scan (Beat `audit.scan_anomalies`, :30 hourly) sends one admin SMS summary (`detail[:60]` per finding, max 3) if `ADMIN_ALERT_PHONE` set.

### Beat comments (#45, commit `b5bfc0f`)
- `celery_app.py` header + immunization comment and `reminder_scheduler.py` docstrings now state: Beat stores last runs in `/tmp/celerybeat-schedule` inside the beat container (`docker-compose.server.yml:118`, no volume); survives VM stop/start → each missed job runs **once** right after start-up; lost on deploy (container recreated) → missed jobs wait for next time.

### OTP email (#45, commit `57b1de0`)
- `backend/app/services/email_service.py`: new constants `_ROSE #b5343e`, `_INK #1a0808`, `_MUTED #7a5252`, `_PANEL #fdf0eb`, `_LINE #e5d4cc`, `_PAGE #f5efe9`, `_SANS`, `_SERIF` (Georgia); `_otp_subject(purpose)`, `_otp_wording(purpose) -> (heading, label, use)`, `_build_otp_text`, `_digit_boxes(otp_code)` (6 `<td class="otp-digit">` 44×56 px, 8 px spacer tds), `_build_otp_html` (serif H1, ✚ rose 28 px badge + "SmartHealth Hub", panel "Sign-in code requested", boxes, `or copy: <span class="otp-copy">CODE</span>`, valid 10 minutes, "Never share this code", footer). Hidden preheader "Valid for 10 minutes. Never share it with anyone." (no code). `import html` for escaping.
- Rendered with WeasyPrint to PDF and checked by eye (login + reset); ✚ centring fixed with `text-align:center`.

### OTP not in production logs (#46)
- `email_service.otp_log_fields(otp_code) -> dict[str, str]`: `{}` if `settings.ENVIRONMENT == "production"` else `{"otp_code": code}`. Used at 5 sites: `send_otp_email` (creds missing; SMTP exception) and `auth_service` login / resend / forgot-password fallback logs (`event: OTP_CONSOLE`). Messages reworded ("OTP email not sent (code logged outside production only)", "Resent OTP email not sent …", "Password-reset OTP email not sent …", "Failed to send OTP email", "EMAIL_HOST_USER or EMAIL_HOST_PASSWORD missing — OTP email not sent.").
- `mfa_service` `dev:otp:{user_id}` Redis copy was already guarded by `ENVIRONMENT == "production"` → untouched.
- `backend/tests/conftest.py` (commit `5f552eb`): after `settings.REDIS_URL = …`, blanks `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `SEMAPHORE_API_KEY`, `ITEXMO_API_KEY`, `PHILSMS_TOKEN`, `TEXTBEE_API_KEY`, `TEXTBEE_DEVICE_ID`. Before this, local runs **sent real OTP emails through the user's Gmail** to `@test.example.com` addresses.

### Repo / tooling
- `.gitattributes` (#44, commit `1aefde1`): `*.sh text eol=lf`. Index already LF; Claude re-checked-out the 4 CRLF working copies on the PC (`backend/scripts/entrypoint.sh`, `infra/backup/backup.sh`, `infra/backup/verify-restore.sh`, `scripts/deploy.sh`); `bash -n scripts/deploy.sh` OK.
- Tests: backend full suite locally **494 passed in 123.71 s** (was 450 at session start). vitest not run this session (no frontend changes; last known 129).
- Docker Desktop is running on the PC; test containers `shh-test-pg` / `shh-test-redis` stopped (`--rm` → removed).
- Uncommitted on purpose (never commit without asking): `README.md` (user's ssh line ~134), `backend/celerybeat-schedule-shm`, `backend/celerybeat-schedule-wal`, `START.md`, `dump.rdb`, `start-tunnel.ps1`. `stash@{0}` still present. Don't drop.
- This handoff file is untracked; needs a docs branch + PR (Session Closed section).

## What We Tried (Chronological)

1. **Onboarding (read-only).** `bd` not found. `git fetch`: origin/main = `074e03f`. CI on `074e03f` all green incl. Docker build (parent Q1). `/health` 200 → VM already on. `/health` body `{"status":"ok","service":"smarthealth-hub-api","version":"0.1.0"}` → can't see commit. Read key files + adjacent: `.github/workflows/deploy.yml` (SSH auto-deploy, no GIT_COMMIT, no --wait), `audit_anomaly_service.py` (LOGIN_FAILED only), `celery_app.py` beat schedule. GitHub API: Deploy workflow **`disabled_manually`**, only 2 runs (both `skipped`, 2026-09-30).
2. **User "go, all defaults"** → scanned seq-9 handoff for private data (grep for emails/phones/IPs/keys: only fake-number note, throwaway test DB creds, 127.0.0.1) and wrote `commit-handoff-seq9.txt`. User merged as #43.
3. **User ran `deploy.sh` on the PC** (PowerShell → Git bash): `: invalid option namene 16: set: pipefail`. Diagnosis: `scripts/deploy.sh` checked out with CRLF (`core.autocrlf=true`, no `.gitattributes`); nothing executed (Docker off on PC, git unchanged). Told user to run on the server.
4. **Server deploy pasted**: server was at `074e03f` already (so #42 code had been pulled + image built the night before, but containers apparently not recreated before the 23:00 shutdown). Build 1.7 s, every step CACHED incl. `COPY app`; backend/beat/worker recreated (GIT_COMMIT changed), db/redis/caddy/backup untouched (Up 15 min); first run of `cleanup()` printed `Disk: 7.3G used, 21G free (26% used)`.
5. **Reliability screenshot** → all as expected. Claude then read `celery_app.py` + `reminder_scheduler.py` and **concluded today's immunization run had been skipped** ("VM came up ~10:45, Beat never re-runs missed jobs" + card "Immunization: not recorded yet"). Proposed catch-up PR. **This conclusion was wrong** (see 9).
6. **#44 TDD.** Pure refactor first: `_dispatch_immunization_reminders_async(today=None)` so the red run fails on behaviour, not `TypeError`. New `tests/test_immunization_reminders.py` (20 tests, pinned `TODAY = date(2026, 12, 1)`). Red: **14 failed / 12 passed**; one (`two_runs_on_the_same_day_send_once`, `(1, 1) != (1, 0)`) failed only because the pinned date ≠ DB `now()` used by the old "created today" check (stated honestly in PR). Implemented window + `status == "scheduled"` + Manila date + any-day dedupe. Full suite: pytest printed **no summary line** → cause: `pyproject.toml` `addopts = "--tb=short -q"` + my `-q` = `-qq`. Counted 470 dots, confirmed `exit 0` in Bash. 470 passed.
7. **`.gitattributes`** added; `printf` swallowed `\r` in the comment → rewrote with Write. Re-checked-out 4 CRLF scripts after `git diff --quiet` proved them unmodified.
8. **User merged #44 + deployed**, sent SMS-log screenshot: two immunization reminders **sent Nov 21, 10:49 AM, due 11/24/2026** (= today + 3, old code's exact target).
9. **Correction.** The 10:49 SMS prove the job ran right after VM start-up: Beat's `PersistentScheduler` keeps `/tmp/celerybeat-schedule` inside the beat container; a VM stop/start keeps the container filesystem, so Beat ran the missed 10:00 job once. The card said "not recorded yet" because the worker was still running #41 code (no run marker) until the 11:0x deploy. Told the user plainly. #44 still justified: whole days off (Beat runs once, not per missed day), deploy after 10:00 (file lost), cancelled/missed doses were reminded, failed not retried, late-entered doses missed, UTC date. Wrote corrected #44 "Why" (`pr44-why-corrected.md`); user to paste it on GitHub (not confirmed).
10. **User: "go" + reference screenshot** (a Gmail OTP summary card: "Code Requested", 6 boxed digits, "Copy code" button). Two PRs planned, then merged into one branch to save the user a round.
11. **#45 brute-force alert.** Discovered the check looked at 5 minutes while running hourly at :30. Checked rate limits (`login:{ip}:{email}` 5/900 s; `verify_otp:{ip}:{user_id}` 5/900 s) and proxy (`--proxy-headers --forwarded-allow-ips *` in Dockerfile CMD → real client IPs). Extracted constants first (5 min / 10) → red run **4 failed / 4 passed** (window, OTP not counted, early-hour missed, two IPs × 15 flagged). Implemented 1 h / >20 / both actions → 478 passed.
12. **#45 Beat comment correction**: 3 sites via scripted replace; fixed an over-long docstring line by hand.
13. **#45 OTP email.** Checked palette (`globals.css`: dashboard teal `#0d9488`; `[data-theme="rose"]` auth pages `#b5343e`), frontend paste handler (`OtpInput.tsx:89` strips non-digits → boxed digits paste fine). Tests first (`test_otp_email.py`, 10) — red only on missing import (stated). Spliced new template section via a scratchpad script (line-number assert on section markers). `ruff format` wanted one blank line. Rendered with **WeasyPrint → PDF → Read** to see it; fixed ✚ centring. Panel narrower than card in WeasyPrint (table width quirk), accepted (Gmail honours `width=100%`). 488 passed.
14. **User asked: do Physician and BHW have the same dashboard?** Investigated `dashboard/page.tsx` (no role logic), the 5 data sources and their guards, `navigation.ts`, `permissions.ts`, and model fields. Answer: yes, identical; reasons + Pending Registrations bug. User pushed back ("aren't they different users?") → Claude agreed and proposed per-role content + `GET /dashboard/me`.
15. **#46 OTP not in logs.** grep found **5** log sites (not the 2 first spotted). Tests (`test_otp_not_logged.py`, 6). First red run: only the 2 email_service tests failed; the 3 auth tests **passed** — debug showed `"OTP email sent successfully"` → local `.env` Gmail creds loaded by tests → real emails sent. Added conftest credential blanking → red **5 failed / 1 passed** (dev test passes as intended), file runtime 19.33 s → 2.92 s. Implemented with `settings.is_production` → **AttributeError** (8 failures, mypy error) → switched to `settings.ENVIRONMENT == "production"`. 494 passed. conftest ruff findings compared to `main` via `git show main:… | ruff check --stdin-filename`: identical 8 (3 E402, 3 F401, 2 I001), CI lints `backend/app` only.
16. **Reviewed the user's dashboard spec** against the code (chart lib, patient fields, models, visit↔appointment link, SMS endpoints, analytics routes, card statuses, verify page). Gave keep / cut / fix lists and 2 decisions. User then merged + deployed #46 and asked for this handoff.

## Key Decisions

- **Immunization reminders: window + "never reminded" instead of exact date.** Covers whole days off and post-10:00 deploys. Rejected: moving the schedule (doesn't fix days off), Beat schedule on a volume (fixes deploys only, not multi-day gaps), keying on due date in `sms_metadata` (would re-send to doses reminded before rollout). Known limit: if a dose's due date changes after its reminder, no second reminder.
- **Only `status == "scheduled"` gets reminders**, matching the tracking board (`immunization_service.list_due`, `get_due_summary`) and the model docstring. Cancelled and missed doses no longer texted.
- **"Today" = Manila date** for immunization; `manila_today()` injectable for tests.
- **Brute-force window = scan interval (1 h)**, threshold **>20**: 20 = max one person can produce on one account under the login limiter in an hour; the BHC shares one public IP (NAT), so lower thresholds would alert on normal mistakes. Rejected: sliding 5-min windows inside the hour (more SQL for no defense value).
- **OTP email**: rose auth palette (not dashboard teal) because the user reads it during sign-in; code **never in subject or preheader** (lock-screen previews); code once as plain text for long-press + Gmail's own "Copy code" chip; **no fake copy button** (no JS in email). Rejected: monospace digits, code in subject (trend, but leaks to notifications).
- **One branch for #45** (alert + comments + email as 3 commits) to save the user a merge/deploy round; separate commits keep review clear.
- **OTP log rule = same as `mfa_service`**: code only when `ENVIRONMENT != "production"`. Rejected: allowlist `== "development"` (would change local `start-prod.ps1`/test behaviour unpredictably; consistency with the existing rule matters more).
- **Tests must never use real email/SMS creds** → blank in conftest at import time (like DATABASE_URL/REDIS_URL already are). `ADMIN_ALERT_PHONE` deliberately NOT blanked (tests may expect it configured; sends are already stubbed by blank provider keys).
- **Dashboard direction (proposed, not built)**: server decides role content in one endpoint `GET /dashboard/me` (authoritative, like `require_role`); counts + short lists only, never diagnosis/treatment text; frontend falls back to the current generic dashboard on 404 (Vercel deploys before backend). Dashboard links to existing pages instead of embedding forms/EHR.
- **Recommendation on export**: `/analytics/export` should allow **BHW + Physician + Admin** (counts only). Pending user decision.

## Evidence & Data

### PR / commit log (this session, all merged to `main`)
| PR | Branch | Commits | Merge | Summary | Files | Deployed? |
|---|---|---|---|---|---|---|
| #43 | docs/handoff-seq9 | `9c75f44` | `bd652a4` | seq-9 handoff | 1 | ✅ (verified `bd652a4` on Version card) |
| #44 | fix/immunization-reminder-catchup | `bdd5fa0` fix(sms), `1aefde1` chore .gitattributes | `bfdcbe1` | immunization catch-up window; LF for .sh | 3 + 1 | ✅ (user) |
| #45 | feat/signin-alert-and-otp-email | `8b3b7d6` fix(audit), `b5bfc0f` docs(workers), `57b1de0` feat(auth) | `9475acc` | brute-force 1 h + OTP_FAILED; Beat comments; OTP email | 3 + 2 + 2 | ✅ (user) |
| #46 | fix/no-otp-in-prod-logs | `5f552eb` test conftest, `3143d95` fix(auth) | `4d2d587` | no real email/SMS in tests; no OTP in prod logs | 1 + 3 | ✅ (user, not independently verified) |

### CI per merge commit
| Commit | pytest | mypy | lint BE | lint FE | tsc | FE build | Docker | Vercel |
|---|---|---|---|---|---|---|---|---|
| `074e03f` (#42) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (parent's open Q1) | ✅ |
| `bd652a4` (#43, docs only) | running at check | running | ✅ | running | n/a | n/a | n/a | pending at check (later deployed fine) |
| `bfdcbe1` (#44) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `9475acc` (#45) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `4d2d587` (#46) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Test count history (backend, local Postgres 18 + Redis 7)
| Point | Passed | Time | New tests |
|---|---|---|---|
| Session start (parent) | 450 | 119.19 s | — |
| #44 | 470 | (summary hidden by -qq; exit 0) | +20 `test_immunization_reminders.py` |
| #45 alert | 478 | 148.86 s | +8 `test_signin_burst_alert.py` |
| #45 email | 488 | 142.17 s | +10 `test_otp_email.py` |
| #46 (bad `is_production`) | 486 passed, 8 failed | 163.64 s | — |
| #46 final | **494** | **123.71 s** | +6 `test_otp_not_logged.py` |

### Red → green runs
| Test file | Red result | Why red | Notes |
|---|---|---|---|
| test_immunization_reminders.py | 14 failed / 12 passed | window [0,1,2], missed/cancelled, earlier-day dedupe ×4, failed retry, same-day run, manila_today ×3 (ImportError, local import) | same-day failure was a pinned-date artifact |
| test_signin_burst_alert.py | 4 failed / 4 passed | `timedelta(300) != timedelta(3600)`; `'21' not in '…had 11 failed login attempts in the last 5 minutes'`; `0 == 1` early-hour; two IPs ×15 flagged | constants extracted first |
| test_otp_email.py | import error only | `_otp_subject` missing | stated honestly, not behavioural red |
| test_otp_not_logged.py (run 1) | 2 failed / 4 passed | auth tests passed because real Gmail send succeeded | led to conftest fix |
| test_otp_not_logged.py (run 2) | 5 failed / 1 passed | `assert not True` (code in logs) | dev test passes by design; 19.33 s → 2.92 s |

### Production Reliability card (screenshot after `bd652a4` deploy, 2026-11-21 ~11:xx Manila)
| Card | Shown | Check |
|---|---|---|
| Admin alerts | Configured, OK | ✅ |
| Version | `bd652a4`, production | ✅ |
| SMS delivery | 0% failed; 24 h: 3 sent · 0 failed; 7 days: 10 sent · 0 failed | ✅ |
| Sign-in | 9 sign-ins; 24 h: 2 wrong passwords · 0 wrong OTP · OTP success 100%; 7 days: 2 wrong passwords · 0 wrong OTP · 76.9% | ✅ 76.9% = 10 LOGIN / 13 OTP_SENT (parent's prod counts) |
| Reminder runs | Last: Nov 21, 11:00 AM; Appointment (hourly): 11:00 AM · 0 SMS; Immunization (daily 10 AM): not recorded yet | ✅ marker works; immunization ran at 10:49 on old code (no marker) |

### SMS log evidence (screenshot, names/numbers omitted)
| Sent at | Kind | Due date in text | Meaning |
|---|---|---|---|
| Nov 21, 10:49 AM (×2) | immunization reminder (Hepatitis B, Flu) | 11/24/2026 | Beat catch-up right after VM start; old code exact target (today+3) |
| Nov 20, 4:00 PM | follow-up appointment reminder | — | normal hourly |
| Nov 20, 10:00 AM (×2) | immunization reminder (BCG) | — | normal 10:00 run |
| Nov 19, 9:58 PM | Filipino registration welcome SMS | — | normal |

### Server deploy output (bd652a4)
```
git log -1 before: 074e03f
Fast-forward 074e03f..bd652a4 (1 file: the handoff)
[+] Building 1.7s (23/23) FINISHED   (all steps CACHED incl. COPY app, RUN mkdir … chown)
backend/beat/worker: Created 16–17 s ago; db/redis/caddy/backup: Up 15 minutes (untouched)
==> Freeing disk space (old build cache and untagged images)
Disk: 7.3G used, 21G free (26% used)
OK: commit bd652a4 is running.
```

### PC deploy attempt (wrong machine)
```
PS C:\...\smarthealth-hub> bash scripts/deploy.sh
: invalid option namene 16: set: pipefail
```
`file scripts/deploy.sh` → "with CRLF line terminators"; `git config core.autocrlf` → true; no `.gitattributes`. `git ls-files --eol '*.sh'`: 4 files `i/lf w/crlf`, `scripts/bootstrap.sh` `w/lf`.

### Dashboard data sources today (identical for every role)
| Dashboard part | Endpoint | Guard | Filtered by user? |
|---|---|---|---|
| Total Active Patients, Visits This Week, Upcoming Appointments, Immunizations Due | `GET /analytics/overview` | any signed-in (`_current_user: CurrentUser`, analytics.py:97-105) | no |
| Recently Registered (5) | `GET /patients?sort=created_at&page_size=5` | `_BHW_PLUS` (bhw, physician, admin_staff, admin) | no |
| Upcoming Appointments (5) | `GET /appointments?status=pending&sort=scheduled_at&page_size=5` | `_read_roles` (admin, bhw, physician, admin_staff) | no |
| Pending Registrations | `GET /intake/pending` + `GET /intake-applications?status=pending&page_size=1` | `_BHW_PLUS` + **`_ADMIN_ONLY`** | no; non-admins get 403 on the second, silently counted 0 |

### Role guards relevant to the dashboard design
| Endpoint / page | Roles |
|---|---|
| `/analytics/export` | admin, bhw (`_ADMIN_OR_BHW`, analytics.py:66, only used on /export) |
| other `/analytics/*` (overview, vaccination-coverage, illness-trends, appointments/no-show-rate, visit-trends, visit-type-breakdown) | any signed-in |
| `/sms/logs` | admin, bhw (`_logs_role`) |
| `/sms/send-manual` | `_send_role` |
| `/patients/archived` | admin, physician |
| `/intake-applications/*` | admin only |
| Sidebar `/analytics` | admin, bhw, physician (navigation.ts:84) |
| Sidebar `/sms-logs` | admin, bhw |
| Sidebar `/settings/registration-qr` | admin, bhw, admin_staff |
| `permissions.ts` | `canAccessClinicalPhi` physician; `canLogVisit` physician+bhw; `canDeleteImmunization` physician |

### Dashboard spec review (user's AI-generated doc) — fact checks
| Claim in doc | Reality in code | Verdict |
|---|---|---|
| Chart.js | `recharts` in frontend/web/package.json | fix wording |
| ReportLab/FPDF card PDFs | WeasyPrint | fix wording |
| MFA "OTP/QR login" | OTP + passkeys + trusted device; no QR login | fix wording |
| Physician Availability Toggle visible to patients booking online | no patient online booking (only public intake drafts `/intake/{token}`, self-registration applications) | cut |
| Health cards "pending" | statuses `active, lost, reissued, revoked` | replace with "patients without a card" |
| Drug refill reminders / current medications | no medications model (models: ai_*, appointment, audit_log, card_verification, health_card, immunization, intake_*, medical_history, mfa_otp, passkey_credential, patient, sms_log, system_setting, trusted_device, user, visit) | cut |
| Appointment vs walk-in ratio | `visits` has no `appointment_id` | cut/defer (would need migration) |
| Senior Citizen / PWD demographics | `patients.is_senior`, `patients.is_pwd` exist | keep |
| Illness trends | `/analytics/illness-trends` from `medical_history.condition_name` | keep (reuse) |
| Immunization coverage | `/analytics/vaccination-coverage` | keep (reuse) |
| Service utilization | `/analytics/visit-type-breakdown` | keep (reuse) |
| SMS manual Resend | only `POST /sms/send-manual`; no resend-of-log | optional new |
| Physician waiting queue | visits today with `diagnosis IS NULL` (logged by BHW) | keep (best idea) |
| LGU/DOH export on Physician | export is admin+bhw today; not FHSIS format | decision 1 |
| Embedded intake form / EHR viewer / consult editor on dashboard | already pages (patient detail, Log Visit) | link, don't embed |
| Only BHW + Physician | 4 roles: admin, bhw, physician, admin_staff | add Admin + Admin staff |
| Footer "AI responses may include mistakes" | — | remove before manuscript |

## Code Analysis

- **Celery Beat catch-up**: `celery -A app.workers.celery_app beat --loglevel=info --schedule=/tmp/celerybeat-schedule` (compose `beat` service, `volumes: []`). PersistentScheduler stores `last_run_at`; on start a crontab whose time passed is due → runs once. Container stop/start (VM shutdown 23:00 + manual start) keeps `/tmp`; `deploy.sh` (`compose up -d --build`) recreates beat when the image/env changes → file lost → no catch-up that day.
- **Beat schedule** (Asia/Manila, `celery_app.py:94-169`): heartbeat every minute (expires 50 s); appointment reminders `:00` hourly; immunization `10:00`; AI risk 21:00, anomaly 21:30; `check_sms_failure_rate` `:30`; `audit.scan_anomalies` `:30`; weekly report Fri 17:00; monthly Fri 17:15 day 22-31; mark-missed 18:00 (`nowfun=manila_now`).
- **Immunization model**: statuses `scheduled, completed, missed, cancelled` (`immunizations_status_check`); `next_due_date` Date, index `idx_immun_next_due`; `administered_by` nullable.
- **Visit model** (relevant to physician queue): `recorded_by`, `visit_date`, `case_no`, `visit_type`, vitals (`blood_pressure`, `temperature`, `pulse_rate`, `respiratory_rate`, `oxygen_saturation`, `weight_kg`, `height_cm`), `chief_complaint`, `past_medical_history`, `present_medical_history`, `diagnosis` (encrypted), `treatment_notes` (encrypted). No `appointment_id`. "Waiting for assessment" = `diagnosis IS NULL` (count/list without decrypting).
- **Appointment model**: statuses `pending, confirmed, completed, missed, cancelled`; `appointment_type` e.g. prenatal, immunization, general_checkup, follow_up, consultation.
- **Patient**: `sitio_purok` (only location grouping); `is_senior`, `is_pwd`; `philhealth_*`; no staff assignment field → no "my patients".
- **Health card**: statuses `active, lost, reissued, revoked`.
- **Rate limits** (`app/core/rate_limit.limiter.check_rate_limit`): login `login:{ip}:{email}` 5/900 s; verify-otp `verify_otp:{ip}:{user_id}` 5/900 s. Uvicorn `--proxy-headers --forwarded-allow-ips *` (Dockerfile:122-123).
- **Test harness**: `pyproject.toml` `addopts = "--tb=short -q"` → don't add `-q` (hides summary); use `-o addopts=""` or check exit code. `tests/conftest.py`: module-level overrides of `settings.DATABASE_URL`, `REDIS_URL`, now email/SMS creds; `set_test_session(session)` makes `CelerySessionLocal` return the test session, so scheduler/worker functions see fixture rows. `_clean_redis` autouse flushes test Redis DB.
- **Frontend dashboard** (`frontend/web/app/(dashboard)/dashboard/page.tsx`, 474 lines): hooks `useDashboardOverview` (hooks/useAnalytics.ts → `/analytics/overview`), `usePanelData`, `usePendingRegistrationsCount` (Promise.allSettled, failures → 0); components `MetricCard` (variants primary/default/rose-tint), two list panels. No role logic.
- **OTP input**: `frontend/web/components/forms/OtpInput.tsx:84-98` `handlePaste` strips `\D`, takes 6.

### Why the dashboard is identical today (answer given to the user)
1. Built once as a general clinic overview; every number is an aggregate without PHI, so nothing needed hiding.
2. No patient is assigned to a staff member (no assigned BHW/physician field; only `sitio_purok`), so there is no "my patients" filter.
3. Role differences live in pages/actions (`permissions.ts`, `navigation.ts`, backend `require_role`), not on the dashboard.
The user then argued they are different users with different jobs; Claude agreed the sameness is historical (dashboard predates RBAC sharpening / model B), not a requirement.

### Timeline (user prompt → outcome)
| # | User said | Outcome |
|---|---|---|
| 1 | Paste prompt (seq 9) + "wait for my go-ahead" | Onboarding; CI on 074e03f green; VM on; deploy.yml disabled; proposed deploy commands |
| 2 | "go, all defaults" | Privacy-scanned seq-9 handoff; commit msg + docs-branch commands |
| 3 | "merged and deployed, check it" (no output) | #43 merged; asked for deploy output + screenshot |
| 4 | Pasted PC PowerShell output (`pipefail` error) | CRLF diagnosis; nothing ran; "run on the server" |
| 5 | Pasted server deploy output | bd652a4 running, 1.7 s build, disk 26% |
| 6 | Screenshot: Reliability section | All correct; (wrong) skipped-run diagnosis; proposed #44 + .gitattributes |
| 7 | Screenshot: SMS templates + "go, all defaults" | Templates ✅; built #44 (470 passed) |
| 8 | Screenshot: SMS log + "merged and deployed, check it, what's next" | Correction (Beat catch-up at 10:49); next-steps list |
| 9 | Screenshot of Gmail OTP card + "go, and make the otp email similar" | #45: alert fix + comment fix + new email (488 passed) |
| 10 | "merged, deployed, check it, what's next, do Physician and BHW have the same dashboard and why" | Verified #45; dashboard analysis; offered OTP-log fix + role dashboards |
| 11 | "do they really have to be the same content? aren't they a different user?" | Agreed; per-role content proposal + `GET /dashboard/me` plan |
| 12 | "Do the security fix first, then review my dashboard md" | #46 (494 passed, found real-email test leak); spec review with keep/cut |
| 13 | "merged and deployed; /handoff and give me the prompt" | This file |

### Tooling gotchas (cost time this session)
- **pytest `addopts = "--tb=short -q"`** in `backend/pyproject.toml`: adding `-q` → `-qq` → **no summary line**. Use `-o addopts=""` (prints `N passed in Xs`) or check the exit code.
- **Local tests used `backend/.env` secrets** (real Gmail) until #46: a test that "passes" by reaching a real service is a false green. Fixed in conftest; keep new external-service tests behind blank creds.
- **`settings.is_production` does not exist** → AttributeError at runtime; mypy catches it (`"Settings" has no attribute`). Use `settings.ENVIRONMENT == "production"`.
- **`printf '\\r'` inside a bash heredoc** swallows the escape; use the Write tool for files with literal backslashes.
- **Scripted multi-replace pattern that worked**: `python - <<'EOF' … def rep(a,b): assert s.count(a)==1 …` (inline heredoc worked this time; the parent's big-heredoc failure was quoting). For large blocks, write the new text to the scratchpad and splice by asserted line markers.
- **Seeing an email/HTML without a browser**: render with WeasyPrint (`HTML(path).write_pdf(out, stylesheets=[CSS(string='@page{size:600px 900px;margin:0}')])`) and Read the PDF. WeasyPrint ignores some table `max-width`/`width=100%` behaviour; Gmail does not.
- **Red runs that pass**: when a "should fail" test passes, debug before implementing (it exposed the Gmail leak). Extract constants / add injectable params first so red fails on behaviour, not ImportError/TypeError.
- **PowerShell cwd persists** across calls; the Bash tool resets cwd outside the workspace. Use absolute paths.
- **Windows `bash` in PowerShell** resolves to Git bash first (`C:\Program Files\Git\usr\bin\bash.exe`), then WSL. Server scripts must still run on the server.
- **`git show main:<path> | ruff check --stdin-filename <path> -`** compares lint findings with main without checking out.
- **GitHub API without auth** (public repo): `/actions/workflows` (state), `/actions/runs` (conclusions), `/commits/<sha>/check-runs`, `/commits/<sha>/status`. Logs still need the user.

### Commands that worked
```bash
# PC (Bash tool)
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/<sha>/check-runs" | python -c "import sys,json; [print(r['name'],r['status'],r['conclusion']) for r in json.load(sys.stdin)['check_runs']]"
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/actions/workflows"     # Deploy = disabled_manually
git ls-files --eol '*.sh'                                                           # i/lf w/crlf diagnosis
git add --dry-run -- <paths>                                                        # verify file counts
# PowerShell
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"                   # daemon in ~10-20 s
# Server (user runs; prompt azureuser@smarthealth-server:/opt/smarthealth-hub$)
cd /opt/smarthealth-hub && git log --oneline -1 && bash scripts/deploy.sh
```

## Files Changed

### Source code
- `backend/app/workers/reminder_scheduler.py` (#44, #45): `manila_today`, `_MANILA_TZ`, `_REMINDED_STATUSES`, immunization window query, docstrings.
- `backend/app/workers/celery_app.py` (#44, #45): schedule header comment (Beat catch-up truth), immunization comment.
- `backend/app/services/audit_anomaly_service.py` (#45): `LOGIN_BURST_WINDOW`, `LOGIN_BURST_THRESHOLD`, `_SIGNIN_FAILURE_ACTIONS`, docstrings, detail text.
- `backend/app/workers/audit_tasks.py` (#45): docstring line.
- `backend/app/services/email_service.py` (#45, #46): new OTP template section, `_otp_subject`, `_otp_wording`, `_digit_boxes`, `otp_log_fields`, log messages.
- `backend/app/services/auth_service.py` (#46): import `otp_log_fields`; 3 fallback logs; comment.

### Tests
- `backend/tests/test_immunization_reminders.py` (#44, new, 20).
- `backend/tests/test_signin_burst_alert.py` (#45, new, 8).
- `backend/tests/test_otp_email.py` (#45, new, 10).
- `backend/tests/test_otp_not_logged.py` (#46, new, 6).
- `backend/tests/conftest.py` (#46): blank email/SMS credentials.

### Config / repo
- `.gitattributes` (#44, new): `*.sh text eol=lf`.

### Docs
- `plans/handoffs/HANDOFF_reliability-done-deploy-pending_2026-11-20.md` (committed in #43).
- This handoff.

### Claude memory
- `local_db_tests.md` updated (addopts -q gotcha, conftest creds, 494).
- `deployment_setup.md` appended (Beat catch-up behaviour).

### Scratchpad (session-only: `C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\2da48d96-a9ed-4414-9998-5caf6b270983\scratchpad\`)
`commit-handoff-seq9.txt`, `commit-immunization-catchup.txt`, `commit-gitattributes.txt`, `pr-body-immunization-catchup.md`, `pr44-why-corrected.md` (replacement "Why" for PR #44, user to paste), `commit-burst-alert.txt`, `commit-beat-comments.txt`, `commit-otp-email.txt`, `pr-body-signin-alert-otp-email.md`, `otp_templates.py` (spliced template source), `otp-email-preview-login.html/.pdf`, `otp-email-preview-reset.html/.pdf`, `commit-tests-no-real-sends.txt`, `commit-no-otp-in-logs.txt`, `pr-body-no-otp-in-logs.md`, `pytest-full.txt`, `commit-handoff-seq10.txt` (for this handoff).

## User Feedback & Preferences (REQUIRED)

- **"go, all defaults"** (4× this session): accept the single recommendation and build; don't re-ask.
- **"merged and deployed, check it" / "…, and tell me what is next"** (4×): verify with `git fetch`, check-runs API, Vercel status, `/health`; answer with tables; end with an ordered next-steps list and a single "say go" question.
- **Questions design assumptions**: "do they really have to be the same content? aren't they a different user?" → the user expects role-appropriate UX; Claude's earlier "identical by design" framing was not enough. Explain *why* something is the way it is, then recommend change when the reason is historical.
- **Brings external specs** (AI-generated markdown) and wants an honest review ("give me your thoughts"): fact-check against the code, keep/cut/fix lists, don't rubber-stamp.
- **Likes current UI trends** ("make the otp … similar design as the provided image, since it's the current trend"). Accepts honest limits (no working copy button in email).
- **Order matters to the user**: "Do the (security fix) first then review …" — follow the stated order exactly.
- **Commits/pushes/merges/deploys themselves.** Give exact `git add -- <paths>`, `git commit -F <scratchpad file>`, push, compare URL, PR-body path, expected "N files changed" (verified with `git add --dry-run`). All counts were right this session.
- **Reads PR bodies in the IDE** before posting (opened scratchpad PR-body files each time) and selects text (README ssh line, PR #44 "Why").
- **Ran `deploy.sh` on the PC by mistake** once: always say "on the server (prompt `azureuser@smarthealth-server`)" when giving server commands.
- **Wants long sessions split via handoffs** and a paste prompt for the next session.
- (Carried) Clear, non-technical admin UI; screenshots everything; never put secrets or patient details in output; never send them into nano/cat on `.env` files; repo is public.

## Where We're Going

0. **START HERE: get the 2 dashboard decisions** (ask once, recommend defaults):
   1. Export (`/analytics/export`): allow **BHW + Physician + Admin**? (recommended yes; counts only, no names).
   2. Scope: the **Keep** list below + Admin and Admin-staff dashboards, dropping the **Cut** items?
1. **Send layout sketches** (ASCII or a small artifact) for the 4 role dashboards; get approval before code.
   - **Physician**: KPIs: Waiting for assessment (today, `diagnosis IS NULL`), Completed consultations (today/week), Follow-ups due (7 d: prenatal/follow_up/check-up appointments + immunizations due), Today's appointments. Panels: waiting queue (patient, time, BHW who logged, vitals summary; link to the visit), today's appointments. One small chart (illness trends or coverage) + link to Analytics.
   - **BHW**: KPIs: Today's appointments, Missed appointments (7 d), SMS today sent/failed, Immunizations due this week + overdue. Panels: immunizations due/overdue with sitio/purok, missed appointments to follow up, failed reminder SMS, pre-visit drafts; "visits I logged this week" (`recorded_by`). Quick actions: Scan card (`/health-cards/verify`), Log visit, Register patient. Patients without an active card.
   - **Admin** (model B, no clinical lists): System Health/Reliability summary, online registrations to review, users/accounts, pending registrations (drafts + applications).
   - **Admin staff** (front desk): today's appointments, check-ins, pending registrations (drafts only).
2. **Build PR (test-first, local Docker DB)**: backend `GET /api/v1/dashboard/me` in `app/api/v1/endpoints/` + `app/services/dashboard_service.py` (role → sections; counts + short lists; no diagnosis/treatment text; audit if any list counts as PHI-VIEW — check how `/patients` list is audited and match it); Pydantic v2 schemas; frontend `dashboard/page.tsx` renders per-role sections, **falls back to current generic dashboard on 404/older backend**; remove the admin-only `/intake-applications` call for non-admins (fixes silent 403). Possibly update `/analytics/export` guard per decision 1. No migration expected.
3. **User checks** (still open): new OTP email in a real inbox (screenshot); Version card shows `4d2d587`; tomorrow's 10:00 immunization run (first live run of #44 code) → Reminder runs card "Immunization (daily 10 AM): Nov 22, 10:00 AM · N SMS" (or a few minutes after VM start); paste `pr44-why-corrected.md` into PR #44 description.
4. **Optional PR 2**: demographics chart (is_senior/is_pwd/age/sex), return rate after SMS reminders, Resend for failed SMS.
5. **Defense readiness (user-only, remind once)**: load gateway SIM + test SMS; write final NTAG215 from demo patient's Print page; deactivate allergy test patient; regenerate demo card PDFs; re-enter house/street for older demo patients; Filipino SMS wording native-speaker review; fix the thesis manuscript wording (Recharts, WeasyPrint, OTP+passkeys, remove AI footer) if the dashboard spec text goes into it.
6. **Optional cleanups (ask first)**: `setex` deprecations (`mfa_service.py:~149`, `passkey_service.py:99`); `datetime.utcnow()` / `HTTP_422_UNPROCESSABLE_ENTITY`; `asyncio_default_fixture_loop_scope`; old ruff findings in `tests/conftest.py` (8) / `test_patients.py` / `test_health_cards.py`; empty `app/(dashboard)/users/`; legacy `backend/scripts/backup_db.py`; delete disabled `.github/workflows/deploy.yml`; `immunization.py` model docstring still says `next_due_date <= now() + interval` (now a window from today).

## Risks & Blockers

- **Frontend-before-backend window**: Vercel deploys on merge, backend only after `deploy.sh`. The dashboard PR must fall back gracefully when `/dashboard/me` is missing (404) — same pattern as `reliability?` in #42.
- **PHI on the dashboard**: lists show patient names/codes (allowed for clinical roles and admin demographics), but never diagnosis/treatment text; admin must not get clinical queues (model B). Decide whether list views write `PHI_VIEW` audit rows (match existing `/patients` list behaviour).
- **Physician queue semantics**: `diagnosis IS NULL` also matches visits a physician logged without a diagnosis, and old visits; restrict to today (Manila date) and maybe `recorded_by` role = bhw.
- **VM auto-shutdown 23:00 Manila**: plan deploys earlier; a deploy after 10:00 skips that day's immunization Beat run (now caught up next day by #44).
- **Gateway SIM has no load** → SMS cards may go yellow/red during demos; accurate, not a bug.
- (Carried) `POSTGRES_PASSWORD`/`ENCRYPTION_KEY` not rotated; old backups contain 2 deleted card PDFs until ~2026-12-04; CI logs unreadable by Claude (user pastes).

## Open Questions

1. Export roles for `/analytics/export` (decision 1 above).
2. Dashboard scope (decision 2 above) and whether Admin staff needs its own layout or shares BHW/front-desk.
3. Does the new OTP email look right in Gmail/phone (panel width, digit boxes, Gmail "Copy code" chip)? Needs the user's screenshot.
4. Is the server really on `4d2d587`? (Version card.)
5. (Carried) Filipino SMS wording native-speaker review before the defense?

## Quick Start for Next Session

```bash
# Reference docs
cat plans/handoffs/HANDOFF_signin-hardening-dashboard-next_2026-11-21.md
cat CLAUDE.md
cat "C:/Users/githu/Downloads/smarthealth-hub-dashboard-content.md"   # user's AI-generated spec (reviewed)

# Key files (explore adjacent code too)
frontend/web/app/(dashboard)/dashboard/page.tsx     # current one-size dashboard (no role logic)
frontend/web/hooks/useAnalytics.ts                  # useDashboardOverview → /analytics/overview
backend/app/api/v1/endpoints/analytics.py           # /overview (any signed-in), /export (_ADMIN_OR_BHW)
backend/app/services/analytics_service.py           # get_dashboard_overview + existing aggregates
frontend/web/lib/navigation.ts, frontend/web/lib/permissions.ts   # role rules mirrored in the UI
backend/app/models/visit.py, appointment.py, immunization.py, patient.py   # fields for queues

# Verify current state (PowerShell on PC)
git fetch --prune; git switch main; git pull; git log --oneline -3     # expect 4d2d587 (+ handoff docs merge)
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health
# Full backend suite locally (Docker Desktop must run; memory local_db_tests.md):
#   docker run -d --rm --name shh-test-pg -e POSTGRES_USER=shh_test -e POSTGRES_PASSWORD=shh_test -e POSTGRES_DB=smarthealthhub_test -p 127.0.0.1:5499:5432 postgres:18-alpine
#   docker run -d --rm --name shh-test-redis -p 127.0.0.1:6399:6379 redis:7-alpine
#   cd backend; $env:DATABASE_URL="postgresql+asyncpg://shh_test:shh_test@127.0.0.1:5499/smarthealthhub_test"; $env:REDIS_URL="redis://127.0.0.1:6399/0"; python -m pytest -p no:warnings -o addopts=""   # expect 494 passed
#   docker stop shh-test-pg shh-test-redis
cd frontend/web; pnpm exec vitest run                                    # expect 129 passed

# Next action
# Ask the 2 dashboard decisions (export roles; scope = Keep list + Admin/Admin-staff, drop Cut list),
# then send per-role layout sketches for approval before writing any code.
```

## Session Closed
**Closed at:** 2026-11-21 (Manila, UTC+8), after #46 was merged and deployed
**Commit:** the `session: signin-hardening-dashboard-next [standalone-9d299342]` commit on branch `docs/handoff-seq10` that includes this note (run by the user from the commands Claude provided; merge via PR, docs only, no server update needed)
**Session status:** Handed off to next session
