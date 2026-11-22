# Removed patients blocked (#66), Add Visit prefill + BHW desk form (#67), appointment timezone fix + data repair (#68), clinic hours (#69): all merged, deployed and checked by the user; next: user-only defense items, then "Start visit" (not yet chosen)

**Date:** 2026-11-22
**Status:** COMPLETED (4 PRs merged this session, CI green on `main` = `c09db3e`, backend deployed, production data repaired, user: "all checked and working")
**Bead(s):** none (`bd` CLI not installed on this PC: `bash: bd: command not found`)
**Epic:** Deploy SmartHealth Hub to production and harden it for the thesis defense (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `15`
**Parent:** `HANDOFF_inactive-patients-live_2026-11-22.md` (seq 14; the session started from its paste prompt)
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > `HANDOFF_nfc-backups-done_2026-11-19.md` > `HANDOFF_phase9-system-health-done_2026-11-19.md` > `HANDOFF_phase10-admin-model-b-done_2026-11-19.md` > `HANDOFF_allergies-media-banner-done_2026-11-20.md` > `HANDOFF_sidebar-and-admin-next_2026-11-20.md` > `HANDOFF_admin-security-settings-done_2026-11-20.md` > `HANDOFF_reliability-done-deploy-pending_2026-11-20.md` > `HANDOFF_signin-hardening-dashboard-next_2026-11-21.md` > `HANDOFF_role-dashboards-live_2026-11-21.md` > `HANDOFF_review-fixes-live_2026-11-22.md` (seq 12) > `HANDOFF_filipino-sms-copy-in-progress_2026-11-22.md` (seq 13, Codex) > `HANDOFF_inactive-patients-live_2026-11-22.md` (seq 14) > this

> ⚠️ This repo is **PUBLIC**. This file contains no passwords, keys, email
> addresses, phone numbers, patient names/codes, staff names, OTP codes or NFC
> signatures. Names in tests ("Ana Reyes", "Resa Test", "Dina Activa") are
> invented. Appointment IDs from production are not copied here.

---

## Stale References

Identifiers from the parent (seq 14) that changed on purpose this session:

- `appointment_service._get_patient_or_404(db, patient_id)`: **removed** in #66 (grep: 0 files). Booking now calls `patient_service.require_patient_in_use()`. Booking an **inactive** patient now returns **409** with the reactivate message (was **404** "not found or is inactive"); archived patients are now refused too (were allowed).
- Parent's "New visit / immunization: **allowed** (no guard)" and "New appointment booking for archived: **allowed**": **no longer true**. All four create paths (visit, immunization, medical history entry, appointment) refuse inactive **and** archived patients with 409.
- `sms_resend_service.resend_problem`: its inactive / archived lines now come from `patient_service.not_in_use_reason()` (same text as before).
- `tests/test_immunizations.py::test_create_immunization_unknown_patient_returns_error`: now asserts **404** (was 409 from the FK integrity error).
- `medical_history.py` endpoints `create_visit` and `add_medical_history`: the `await patient_service.get_patient(db, patient_id)` line is **gone** (the service checks now).
- Parent "Docker test DB: ~2 min, 617 passed": now **701 passed in ~3 min**, and tests should run with **`TZ=UTC0`** (see Key Decisions).
- `DEV-WORKFLOW.md` §4 still says `npm run dev` (line 108) and §7 still says next migration `0029` (lines 200-206): **still stale** (head is `0032`, next `0033`; no migration this session).

## Since Last Handoff

- **Parent step 1 (user browser checks of #64)**: done. User: "#64 works".
- **Parent step 2 (merge seq 14 handoff)**: already done when this session started: PR **#65** (`docs/handoff-seq14`) merged as `de66727`; the user had also already deleted the local `docs/handoff-seq14` branch (`git branch -d` → "branch not found"). `fix/inactive-patients` was gone too.
- **Parent optional follow-up "Block new visits / immunizations for inactive patients" + "Decide whether archived patients may still be booked"**: done as **#66** (user chose "Inactive + Archived"). Also covered medical-history entries (not in the question; told the user).
- **Parent open question 2** (block visits for inactive? book archived?): answered: block both, for both kinds.
- **New work not in the parent plan**, all user-requested: Add Visit automation (#67), the appointment **timezone bug** it uncovered (#68, production saved every booking 8 h late since go-live), and clinic hours (#69).
- **Parent risk "Inactive patients can still get visits via a direct URL"**: resolved by #66.
- **Parent optional follow-ups still open**: Archive page `archived_by` UUID; manual SMS to archived patients (`sms.py` ~199); STOP lookup ignores inactive (`sms.py` ~622); DEV-WORKFLOW docs; `AGENTS.md`; seq 12 cleanup list.
- **Trajectory**: still defense hardening. The user tests each PR in the browser right after deploy, finds confusing or broken behaviour, and asks "why"; honest root-cause answers led to the biggest fix of the session (#68).

## Reference Documents

- `CLAUDE.md`: conventions (Admin model B, audit every write, Alembic-only schema changes, AES-256-GCM fields, module boundaries, no PHI on NFC/QR).
- `DEV-WORKFLOW.md`: §3 git, §4 local dev (says npm; use pnpm), §5 CI checks + Docker test DB, §6 `deploy.sh`, §7 migrations (number stale), §9 server cheat sheet (`dc exec db sh -c 'psql ...'` line 262; `dc exec backup sh /scripts/backup.sh now`), §10 backups, §13 agreements.
- `docs/SmartHealth_Hub_System_Development_Plan.md` (git-ignored, local): authoritative scope.
- Parent: `plans/handoffs/HANDOFF_inactive-patients-live_2026-11-22.md` (#64 internals, Deactivate vs Archive spec, Appendix B API table, Appendix D UI strings).
- Claude memory (`C:\Users\githu\.claude\projects\c--Users-githu-OneDrive-Documents-smarthealth-hub\memory\`): **`local_db_tests.md` updated this session** (new paragraph "Run as a UTC server": `TZ=UTC0`, asyncpg naive-datetime behaviour, `app/utils/manila_time.py`) and its `MEMORY.md` line ("~3 min; run with TZ=UTC0 like the server"). Others unchanged: `deployment_setup.md`, `feedback_no_secret_screens.md`, `feedback_ci_logs.md`, `pnpm_not_npm.md`, `web_workers_testing.md`, `project_scaffold.md`.

## The Goal

SmartHealth Hub (thesis: Barangay Health Center records with NFC/QR health cards, SMS reminders, OTP MFA) runs in production for the thesis defense: website `https://smarthealth-hub-two.vercel.app` (Vercel, auto-deploys on merge to `main`), API `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose, deployed by the user with `bash /opt/smarthealth-hub/scripts/deploy.sh` **on the server**). This session made "removed" patients (deactivated/archived) truly out of daily work, cut typing in Add Visit, found and fixed a production-wide appointment time bug (every booking saved 8 hours late because the backend container runs on UTC), repaired the two affected production rows, and stopped out-of-hours bookings (the AM/PM slip that the repair revealed). Remaining: user-only defense items, then the next small PR the user picks (recommended: "Start visit" on today's appointments).

## Where We Are

### Production (verified at handoff time)
- `origin/main` = **`c09db3e`** (merge of #69). Local `main` = `c09db3e` (fast-forwarded), on branch `main`, merged feature branches deleted.
- CI on `c09db3e`: pytest ✅, mypy ✅, lint BE ✅, lint FE ✅, tsc ✅, FE build ✅, Docker build ✅ (changelog skipped as usual); Vercel ✅.
- `/health` → `{"status":"ok","service":"smarthealth-hub-api","version":"0.1.0"}`.
- Production `/openapi.json` has `/api/v1/appointments/clinic-hours` (#69), `/api/v1/patients/{patient_id}/visits/prefill` (#67), and `SystemSettingsUpdate.clinic_open_time`. Anonymous `GET /api/v1/appointments/clinic-hours` → **401** (protected, correct).
- **Production data repair (#68 script) applied by the user**: 2 appointments moved back 8 h; 1 audit row `entity_type='appointment_timezone_fix'`.
- **User browser checks: all passed** ("all checked and working"): clinic-hours hint + 12:00 AM red message on Book Appointment; Admin Settings shows 7:00 AM / 5:00 PM; the old 12:00 AM booking cancelled; Add Visit prefill shows "Prenatal check-up" + note for a same-day booking.

### What exists now (by PR)
- **#66 (removed patients)**: `patient_service.require_patient_in_use(db, patient_id) -> Patient` (404 missing, 409 inactive/archived) called at the top of `visit_service.create_visit`, `immunization_service.create_immunization`, `medical_history_service.add_medical_history`, `appointment_service.create_appointment`. `patient_service.not_in_use_reason(patient) -> str | None` shared with Resend. Frontend `lib/patient-status.ts` (`patientNotInUseReason`), patient page shows "New visits paused (inactive|archived)" instead of "+ Add Visit", `/patients/{id}/visits/new` shows a blocked notice, Book Appointment toasts the 409 text.
- **#67 (Add Visit)**: `GET /patients/{id}/visits/prefill` (BHW + Physician) → `VisitPrefill{appointment_id, appointment_type, scheduled_at, visit_type, chief_complaint, intake_visit_purpose}` from the earliest pending/confirmed/missed appointment **today (Manila day)** + its submitted intake form; VIEW_PHI audit `entity_type="visit_prefill"` only when intake answers are read. `POST /patients/{id}/visits`: non-Physician sending non-blank `diagnosis`/`treatment_notes` → **403**. Frontend: form prefilled (never overwrites typed values), note "Filled in from today's … appointment at … and the patient's intake form. Check the details before saving.", BHW form without Diagnosis/Treatment, history fields folded in `<details>`.
- **#68 (timezone)**: `app/utils/manila_time.py` (`MANILA`, `assume_manila`, `to_manila`); `AppointmentCreate/Update.scheduled_at` pinned to Manila when naive; future check vs `datetime.now(tz=UTC)`; three appointment SMS texts print Manila time; frontend sends `+08:00` (`lib/manila-time.ts`); one-off `scripts/fix-appointment-timezone.sql` (preview default, `-v apply=1`).
- **#69 (clinic hours)**: settings `clinic_open_time` / `clinic_close_time` ("HH:MM", default `07:00` / `17:00`, key-value `system_settings`, no migration); booking + reschedule outside `[open, close)` → 422; status-only updates never blocked; `GET /appointments/clinic-hours` (all staff); Book Appointment shows hours, limits picker, flags bad times live; Settings has "Clinic opens / Clinic closes".

### Tests
- Backend full suite: **701 passed** under `TZ=UTC0` (session start 617; #66 640; #67 668; #68 678; #69 701).
- Frontend vitest: **249 passed / 35 files** (session start 217; #66 224; #67 232; #68 236; #69 249). Lint **0 errors / 81 warnings** (unchanged all session). `tsc --noEmit` clean. `next build` OK.

### Local state (uncommitted on purpose; never commit without asking)
- `README.md` (user's ssh line), `backend/celerybeat-schedule-shm`, `backend/celerybeat-schedule-wal`, `START.md`, `dump.rdb`, `start-tunnel.ps1`. `stash@{0}` ("WIP on main: d041507 …") still present — never drop.
- Docker test containers `shh-test-pg` / `shh-test-redis` **stopped** (`--rm`, gone). Docker Desktop may still be running.
- This handoff is untracked on `main` until the user runs the close commands (branch `docs/handoff-seq15`).

## What We Tried (Chronological)

1. **Onboarding** (paste prompt from seq 14). `bd` not installed. `git fetch` showed `origin/main` = `de66727` (#65 merged), local `main` behind; CI + Vercel green; `/health` ok. Read `patient_service` deactivate/reactivate/list_inactive/user_names, `reminder_scheduler._patient_can_be_texted`, `PatientDeactivation.tsx`, `inactive/page.tsx`, migration 0032 outline. Adjacent exploration found: `visit_service.create_visit` never loads the patient; `immunization_service.create_immunization` neither; `appointment_service._get_patient_or_404` checked `is_active` only; `sms.py:199` / `sms.py:622` active-only; Archive page `archived_by` raw UUID (`archived/page.tsx:286`). Waited for go-ahead.
2. **User: "#64 works"** → AskUserQuestion on block scope → "Inactive + Archived (Recommended)".
3. **#66 build**. Branch creation first failed (`git branch -d docs/handoff-seq14` → not found; the user had deleted it), retried. Tests first: `tests/test_removed_patients_blocked.py` → red **12 failed / 9 passed** (`AttributeError … require_patient_in_use`; visits/doses created 201 for removed patients = gap reproduced; inactive booking 404, archived booking 201). Added `require_patient_in_use` + `not_in_use_reason`, wired 4 services, removed redundant endpoint `get_patient` calls. Related suites 191 passed + 1 failed (`test_create_immunization_unknown_patient_returns_error` expected FK 409, now 404) → updated that test, dropped my duplicate. Full **640 passed** (183 s). Frontend tests written after implementation; proved red by temporarily restoring the old `visits/new/page.tsx` from HEAD (2 failed / 1 passed), restored my copy (diff +18 confirmed).
4. **#66 packaging mistake**: computing per-commit stats with `GIT_INDEX_FILE=<scratch>` I ran `git commit -q -m tmp` → **created real local commit `12e3ef9 tmp`** on the feature branch. Undone with `git reset --soft HEAD~1` (HEAD back to `de66727`, real index empty, working tree unchanged, stash intact). Told the user. Afterwards stats were computed with `git add` + `git diff --cached --shortstat` on a scratch index only, never `git commit`.
5. **User: "merged and deployed, check it first"** → CI green on `ed1d063`, waited for running checks with a background poll loop. No new routes, so the backend version can only be seen on Admin → System Health (`GIT_COMMIT` from `deploy.sh`, `config.GIT_COMMIT`). **User: "what account?"** → explained per check: Admin for System Health; **Physician** for "New visits paused" (only physician/BHW see Add Visit; BHW can't reach an inactive patient because search hides them and Inactive Patients is Admin+Physician).
6. **User: "is there a way to make the 'Add Visit' more automated, so its not hustle for crud?"** → explored: Add Visit has 14 fields; intake form (`app/intake/[token]/page.tsx`) has 13 purposes + per-purpose details (`schemas/intake.py`: `GeneralConsultationDetails.chief_complaint`, `has_fever`, `HypertensionDetails.current_medications`, …); `AppointmentResponse.intake_summary` only on GET `/appointments/{id}`, not the list; Physician dashboard waiting list = today's visits with `diagnosis IS NULL` (`dashboard_service.build_physician`); BHW saw Diagnosis/Treatment fields. Offered 4 options (multiSelect) → user picked "Prefill from today" + "Shorter BHW form"; not picked: "'Start visit' buttons", "Copy past history".
7. **#67 build**. Chose a backend endpoint over two browser calls (list has no intake; Manila-day logic testable in pytest). First red run was an **ImportError** (no `intake_chief_complaint`) → added a stub returning None → behavioural red **23 failed / 5 passed** (two showed BHW diagnosis/treatment saved 201). Adding `from typing import Any` with `sed -i` **converted `visit_service.py` CRLF→LF** (Git Bash sed); restored with a Python CRLF round-trip, `git diff --stat` 9 lines. Then the branch was still the merged `fix/block-removed-patients` → switched to `feat/visit-prefill` from `origin/main` (trees equal). Green 110 related; full **668**; `ruff format` fixed the test file. Frontend red 4 failed / 4 passed (the 4 passing guard "save without diagnosis" / "don't overwrite").
8. **User report: prefill not working** ("why the appoinment process does not really solve anything??? … i cannot find it, because when i book an active patient for a prenatal check up on appointment, and when i add visit it is not auto."). Checked: #67 merged (`d230646`) and route live in production. Traced booking: page sends `${date}T${time}:00` (no tz); `docker-compose.server.yml` gives `TZ: Asia/Manila` only to the `backup` service; backend container = UTC. Proved with a scratch script (`tzcheck.py`): naive 21:00 → PC stores `13:00Z` (Manila), `TZ=UTC0` stores `21:00Z` (= Nov 23 05:00 AM Manila); asyncpg source `pgproto/codecs/datetime.pyx:222 utc_dt = obj.astimezone(utc)`. Also found SMS `strftime` on UTC values (two bugs cancelling). Explained the appointment→visit flow honestly (prefill saves only the visit-type dropdown without an intake form; walk-ins get nothing; "Start visit" would save the search). AskUserQuestion: old bookings → "Shift them back (Recommended)"; scope → "Time fix only (Recommended)".
9. **#68 build**. Checked seed data: production seeded with `seed_db.py` (40 appointments, aware times, `created_by` set, **no audit rows**) → audit rows are the reliable marker of website bookings; CREATE metadata stores `scheduled_at.isoformat()` (naive string before the fix). Reschedule UI does not exist (detail page only changes status; `AppointmentForm.tsx` unused). Tests under `TZ=UTC0`: red **8 failed / 2 passed**; green 10 both as UTC and Manila. Full **678** under `TZ=UTC0`. Repair script tested on scratch DB `tzfix_check` (`alembic upgrade head` → 0032) with 5 cases → preview 2 rows, apply fixed exactly 2, second apply 0, one audit row; DB dropped.
10. **User ran the repair** (pasted output, below). Then the audit query showed the first booking was **sent as `2026-11-30T00:00:00`** (12:00 AM) at 8:11 PM and the second as `08:00` at 8:14 PM → AM/PM slip, re-booked 3 min later. Both for **Nov 30**, which also explained the user's prefill test: prefill only uses **same-day** appointments.
11. **User: "yes, limit bookings to clinic hours"** → #69. Settings are key-value JSONB (`system_settings`), so no migration; `/system/info` is Admin-only → new staff endpoint `/appointments/clinic-hours`. Tests: red **13 failed / 10 passed** (12:00 AM, 6:59 AM, 5:00 PM, 9:00 PM accepted). 5 older tests then failed because they booked at "now + 2 days" (current time of day) or in the evening → moved to 10:00 AM Manila; the evening prefill regression test now inserts `SystemSetting` rows `00:00`/`23:59` so it still reproduces #68. Full **701**. Frontend booking test red 4/4 vs old page.
12. **User: "merged and deployed, check it first and tell me what's next."** → OpenAPI proved the backend deploy this time (new route). **User: "all checked and working"** → handoff.

## Key Decisions

- **Block both deactivated and archived patients from new records** (visit, immunization, medical history, booking), per the user's definitions (Deactivate = "disabled from being used right now", Archive = "stored away"). Viewing old records unchanged. **409 with "how to undo" text**, same messages as Resend (single source `not_in_use_reason`). Rejected: inactive-only (user chose both).
- **Guard in services, not routes**, so every caller is covered; redundant endpoint `get_patient` calls removed. Inactive booking changed 404 → 409 (clearer UI message).
- **Included medical history entries** in #66 although the question named visits/immunizations/bookings: same "new record" rule; called out to the user.
- **Visit History page (`history/page.tsx`) "+ Add Visit" left visible**: hiding it needs `GET /patients/{id}` (extra VIEW_PHI audit row per view); the New Visit page shows the blocked notice instead.
- **Prefill via one backend endpoint** (`/visits/prefill`) instead of two browser calls (list + detail): list lacks intake; Manila-day SQL (`func.timezone('Asia/Manila', …)`) testable; one audited read. Only **today's** appointment is used (the visit happens on the appointment day); walk-in intake tokens not linked to an appointment are ignored (scope).
- **Intake → chief complaint as plain text draft**: reason (or "Others" own words from `draft_data.visit_purpose_other`), free-text keys (`chief_complaint`, `chief_dental_complaint`, `concern`, `reason_for_visit`), `has_*` True flags as "Reports: …" (sorted, because JSONB does not keep key order), duration, medications. Patient-reported vitals (e.g. reported BP) are **not** prefilled (vitals are measured at the visit).
- **BHW may not send diagnosis/treatment (403)**: matches Admin model B (only Physician reads them) and keeps the visit on the Physician's waiting list (`diagnosis IS NULL`). Blank strings accepted (old forms). Past/present history kept for BHW, folded in `<details>` (rejected: hiding them; physicians can still edit via PUT `/visits/{id}`).
- **Timezone fix at both ends**: frontend sends `+08:00`; backend pins naive to Manila (old cached tabs, Swagger); SMS formats with `to_manila`. Rejected: setting `TZ=Asia/Manila` on backend/worker/beat containers (would change every naive `datetime.now()` and hide the issue instead of making code explicit).
- **Data repair by evidence, not by date**: only rows whose newest audit write of `scheduled_at` has **no timezone** AND whose saved value equals that string read as UTC → idempotent, never touches seed rows or post-fix bookings. Preview by default; `-v apply=1`; one summary audit row with IDs; no patient names in output. Rejected: Alembic migration (dev DB was correct, prod wrong); date-cutoff heuristics.
- **Run backend tests as a UTC server (`TZ=UTC0`)**: the PC's Manila clock hid the bug; CI (Ubuntu) is UTC. Saved to memory.
- **Clinic hours as Admin settings** (key-value, audited, no migration), default 7:00 AM–5:00 PM, `[open, close)`. Status-only updates never blocked (so the 12:00 AM booking could be cancelled). Cross-check "closing after opening" uses the values in effect **after** the save (one may be unchanged/reset). Rejected: hard-coded hours; weekends/clinic days (not asked; listed as follow-up).
- **One PR per user request, two commits each (backend, frontend)**; the user commits/pushes/merges/deploys from commands + `git commit -F` files.

## Evidence & Data

### PRs this session
| PR | Branch | Commits | Merge | Backend files +/− | Frontend files +/− |
|---|---|---|---|---|---|
| #66 | fix/block-removed-patients | `f74a5fa` fix(patients): no new visits, doses, history or bookings for removed patients; `351075b` feat(patients): show why removed patients can't get new visits | `ed1d063` | 9, +401/−29 | 6, +181/−4 |
| #67 | feat/visit-prefill | `2a05960` feat(visits): suggest Add Visit values from today's appointment; BHW desk visits; `d2b89ea` feat(visits): prefilled Add Visit form and a shorter BHW form | `d230646` | 4, +621/−3 | 5, +316/−24 |
| #68 | fix/appointment-timezone | `a4364ec` fix(appointments): appointment times are Manila times on a UTC server; `49da01f` fix(appointments): send booking times with the Manila offset | `9b6f02b` | 8, +385/−12 | 4, +58/−4 |
| #69 | feat/clinic-hours | `7fc6b9f` feat(appointments): only book during clinic hours (Admin-editable); `7b12369` feat(appointments): show clinic hours when booking; edit them on Settings | `c09db3e` | 9, +391/−13 | 8, +288/−10 |

Merged stats verified against built stats each time (`git diff --stat <prev-main> origin/main`): #66 15 files +582/−33; #69 17 files +679/−23; #68 12 files +443/−16.

### CI per merge commit (all green)
| Commit | pytest | mypy | lint BE | lint FE | tsc | FE build | Docker | Vercel |
|---|---|---|---|---|---|---|---|---|
| `de66727` (#65, session start) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ed1d063` (#66) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `d230646` (#67) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `9b6f02b` (#68) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `c09db3e` (#69) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Test count history
| Point | Backend | Frontend | Notes |
|---|---|---|---|
| Session start | 617 | 217 | from seq 14 |
| #66 | **640** (183 s) | **224** | +23 / +7 |
| #67 | **668** (218 s) | **232** | +28 / +8 |
| #68 | **678** (200 s, `TZ=UTC0`) | **236** | +10 / +4 |
| #69 | **701** (192 s, `TZ=UTC0`) | **249** (35 files) | +23 / +13 |

### Red → green per PR
| Test file | Red | Why red |
|---|---|---|
| `test_removed_patients_blocked.py` | 12 failed / 9 passed | no `require_patient_in_use`; visit/dose 201 for inactive+archived; archived booking 201; inactive booking 404 |
| `NewVisitBlocked.test.tsx` (vs old page) | 2 failed / 1 passed | form shown for removed patients |
| `test_visit_prefill.py` | ImportError, then 23 failed / 5 passed | route 404 "Not Found"; BHW diagnosis/treatment saved 201; summarizer stub None |
| `AddVisitPrefill.test.tsx` | 4 failed / 4 passed | no prefill, BHW saw Diagnosis |
| `test_appointment_timezone.py` (`TZ=UTC0`) | 8 failed / 2 passed | `21:00 UTC` stored for 9 PM; past booking accepted; prefill None for evening booking; SMS "01:00 AM"; hourly reminder "12:27 PM" vs Manila "08:27 PM" |
| `test_clinic_hours.py` | 13 failed / 10 passed | 12:00 AM / 6:59 AM / 5:00 PM / 9:00 PM accepted; `/clinic-hours` parsed as appointment id (422); settings extra field forbidden |
| `BookAppointmentHours.test.tsx` (vs old page) | 4 failed | no hours hint / min / max / red line |

### New backend tests by file
| File | Count | Covers |
|---|---|---|
| `tests/test_removed_patients_blocked.py` | 23 | shared check (5), visits (5), immunizations (5), appointments (4), medical history (3), reactivated patient can get a visit (1) |
| `tests/test_visit_prefill.py` | 28 | `intake_chief_complaint` (4), prefill: none today, 6 type mappings, 07:30 Manila counts as today, cancelled/completed ignored (2), other days (2), earliest wins, intake text + VIEW_PHI audit, "Others" text, unsubmitted intake ignored, unknown 404, admin/admin_staff 403 (2); BHW desk: logs vitals, 403 diagnosis/treatment (2), blank ok, physician ok |
| `tests/test_appointment_timezone.py` | 10 | naive = Manila, explicit `+08:00`/`Z` kept, hour-ago refused, reschedule naive, evening booking shows in prefill, 4 SMS texts (builder, booking, hourly, send-reminder) |
| `tests/test_clinic_hours.py` | 23 | read hours ×4 roles, inside ×3, outside ×4, Manila hours (02:00Z ok), reschedule refused, status change allowed ×2, settings defaults, new hours apply + audit, bad formats ×3, close ≤ open ×2, admin-only |

### Timezone proof (scratch script `tzcheck.py`, same conversion asyncpg does)
```
== as this PC (Manila)
stored as UTC   : 2026-11-22T13:00:00+00:00
in Manila       : Nov 22 09:00 PM
== as the server container (UTC)   (TZ=UTC0 python tzcheck.py)
stored as UTC   : 2026-11-22T21:00:00+00:00
in Manila       : Nov 23 05:00 AM
asyncpg/pgproto/codecs/datetime.pyx:222:    utc_dt = obj.astimezone(utc)
```

### Repair script hand test (scratch DB `tzfix_check`, `alembic upgrade head` → `0032`)
| Row | Setup | Preview | After apply (Manila) |
|---|---|---|---|
| A | CREATE sent `2026-11-22T21:00:00`, saved `21:00+00` | to fix | **Nov 22 09:00 PM** |
| B | seed row, no audit, `01:00+00` | — | Nov 25 09:00 AM (untouched) |
| C | CREATE sent `…T21:00:00+08:00`, saved `13:00+00` | — | Nov 23 09:00 PM (untouched) |
| D | CREATE `…T09:00:00` then UPDATE `…T15:00:00`, saved `15:00+00` | to fix | **Nov 24 03:00 PM** |
| E | CREATE `…T10:00:00`, saved `02:00+00` (doesn't match "as UTC") | — | Nov 26 10:00 AM (untouched) |
Preview: `to_fix 2`, ROLLBACK. Apply: `UPDATE 2`, `INSERT 0 1`, COMMIT. Apply again: `to_fix 0`; audit rows `1 | 2`.

### Production repair (output pasted by the user, `azureuser@smarthealth-server:/opt/smarthealth-hub`)
```
 to_fix
--------
      2
 appointment_type |  status   |    shows_now     |    will_show
------------------+-----------+------------------+------------------
 prenatal         | confirmed | Nov 30, 08:00 AM | Nov 30, 12:00 AM
 prenatal         | pending   | Nov 30, 04:00 PM | Nov 30, 08:00 AM
UPDATE 2 / INSERT 0 1 / COMMIT / APPLIED
```
Audit follow-up query (pasted):
```
 action |     done_at     |  time_sent_by_page
 CREATE | Nov 22 08:11 PM | 2026-11-30T00:00:00
 CREATE | Nov 22 08:14 PM | 2026-11-30T08:00:00
```
→ first booking was an AM/PM slip (re-booked 3 min later); user cancelled it after #69.

### Visit type mapping (`visit_service._VISIT_TYPE_FOR_APPOINTMENT`)
| Appointment type | Visit type |
|---|---|
| checkup, general_checkup, consultation, dental | consultation |
| prenatal | prenatal_checkup |
| vaccination, immunization | immunization_admin |
| follow_up | follow_up |
| anything else | null (form default stays) |

### Chief complaint examples (exact test expectations)
| Intake | Draft |
|---|---|
| Hypertension / BP; has_headache, has_dizziness, has_chest_pain=False; current_medications "Amlodipine 5 mg" | `Hypertension / BP. Reports: dizziness, headache. Medications: Amlodipine 5 mg.` |
| General Consultation; chief_complaint "Ubo at sipon"; duration "3 days"; has_fever | `General Consultation. Ubo at sipon. Reports: fever. Duration: 3 days.` |
| Others + draft `visit_purpose_other` "Masakit ang tuhod" | `Masakit ang tuhod.` |

### Removed patients: before / after (#66)
| New record | Deactivated | Archived |
|---|---|---|
| Visit | allowed → **409** | allowed → **409** |
| Immunization dose | allowed → **409** | allowed → **409** |
| Medical history entry | allowed → **409** | allowed → **409** |
| Appointment booking | 404 → **409** | allowed → **409** |
| Viewing old records | allowed | allowed |

### Clinic hours behaviour (#69, default 07:00–17:00 Manila)
| Booking time | Result |
|---|---|
| 07:00, 10:30, 16:59 | 201 |
| 00:00, 06:59, 17:00, 21:00 | 422 "Appointments can only be booked during clinic hours, 7:00 AM to 5:00 PM. Pick a time in that range (check AM / PM)." |
| 02:00Z (= 10:00 AM Manila) | 201 |
| PUT status only on a 12:00 AM booking | 200 |
| Settings open 18:00 (close 17:00) / open=close 09:00 | 422 "The closing time must be after the opening time." (nothing saved) |
| Settings "7am", "25:00", "17:5" | 422 (pattern) |

### Production probes at handoff time
| Check | Result |
|---|---|
| `/health` | ok |
| OpenAPI `/api/v1/appointments/clinic-hours` | True |
| OpenAPI `SystemSettingsUpdate.clinic_open_time` | True |
| OpenAPI `/api/v1/patients/{patient_id}/visits/prefill` | True |
| Anonymous GET clinic-hours | 401 |

## Code Analysis

- `patient_service.INACTIVE_PATIENT_MESSAGE` = "The patient is inactive. Reactivate them on the Inactive Patients page first."; `ARCHIVED_PATIENT_MESSAGE` = "The patient is archived. Restore them from the Patient Archive first." `not_in_use_reason` reports inactive first. `require_patient_in_use` raises `ConflictError(reason, detail={"patient_id": …})` (HTTP 409 via `AppError` handler; frontend `ApiError.message` = `body.error.message`).
- Import graph (no cycles): `visit_service` → `appointment_service`, `patient_service`; `appointment_service` → `patient_service`, `system_settings_service`, `app.utils.manila_time`; `immunization_service` / `medical_history_service` / `sms_resend_service` → `patient_service`.
- `visit_service.visit_prefill(db, patient_id, user_id, *, today=None, ip_address=None) -> VisitPrefill`: day = `datetime.now(ZoneInfo("Asia/Manila")).date()`; appointment filter `status IN appointment_service.VISIT_COMPLETES_STATUSES` (`pending`, `confirmed`, `missed`) and `func.date(func.timezone("Asia/Manila", scheduled_at)) == day`, earliest first; intake = latest `PatientIntakeToken` with `appointment_id` and `draft_data IS NOT NULL`; audit + commit only when intake found.
- `medical_history.py`: `_NOTES_ROLES = {"physician"}` reused for the BHW 403 check (`current_user.role.name`); route `GET /patients/{patient_id}/visits/prefill` uses `_CLINICAL` (physician, bhw).
- `app/utils/manila_time.py`: `assume_manila(dt)` (naive → `replace(tzinfo=MANILA)`), `to_manila(dt)` (`assume_manila(dt).astimezone(MANILA)`). Used by `schemas/appointment.py` validators, `sms_service.build_appointment_reminder`, `reminder_scheduler` (appointment job), `appointments.py` send-reminder, `appointment_service._require_clinic_hours`.
- `system_settings_service`: `CLINIC_OPEN_TIME="clinic_open_time"`, `CLINIC_CLOSE_TIME="clinic_close_time"`, defaults `"07:00"`/`"17:00"`, `_SIMPLE_KEYS` (5 keys), `_hhmm(str) -> time`, `format_clock(time) -> "5:00 PM"`, `RuntimeSettings.clinic_open_time/clinic_close_time/outside_clinic_hours(local_time) -> str | None`; `update_settings` computes `effective(key)` (change → default if None → current) then raises `ValidationError` before writing.
- `schemas/system_config.SystemSettingsUpdate` has `extra="forbid"`; clinic fields `pattern=r"^([01]\d|2[0-3]):[0-5]\d$"`. `SystemSettingsResponse` gains `clinic_open_time`, `clinic_close_time` (`SettingValue`).
- `appointments.py`: `GET /appointments/clinic-hours` registered **before** `GET /{appointment_id}` (else 422 UUID parse — seen in red run). `_read_roles` = admin, bhw, physician, admin_staff.
- Frontend: `lib/clinic-hours.ts` (`DEFAULT_CLINIC_HOURS`, `formatClock("17:30")→"5:30 PM"`, `outsideClinicHours(time, hours)` compares "HH:MM" strings), `hooks/useAppointments.fetchClinicHours()` (null on error), booking page `timeProblem` live + `setError("scheduledTime", {type:"clinicHours"})` on submit; toast shows server text when `status===409` or (`422` and message ≠ "Request validation failed"). `lib/manila-time.ts` (`manilaIso(date,time)` adds `:00` for "HH:MM", `+08:00`; `manilaToday()` via `Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Manila"})`).
- `visits/new/page.tsx`: hooks before early returns; prefill effect gated on `canLogVisit(currentUser?.role)`; `visitTypeTouched` ref; chief complaint filled only if empty; `isPhysician = canAccessClinicalPhi(role)` controls fields + payload; `historyFields` JSX shared.

## Files Changed

### Backend source
- `backend/app/services/patient_service.py` (#66): messages, `not_in_use_reason`, `require_patient_in_use`; imports `ConflictError`.
- `backend/app/services/visit_service.py` (#66, #67): guard in `create_visit`; `_MANILA`, `_VISIT_TYPE_FOR_APPOINTMENT`, `_INTAKE_TEXT_KEYS`, `_INTAKE_DURATION_KEYS`, `_clean`, `intake_chief_complaint`, `visit_prefill`; imports `Appointment`, `PatientIntakeToken`, `VisitPrefill`, `ZoneInfo`, `Any`.
- `backend/app/services/immunization_service.py`, `medical_history_service.py` (#66): guard at the top.
- `backend/app/services/appointment_service.py` (#66, #68, #69): `_get_patient_or_404` removed → `require_patient_in_use`; future check `datetime.now(tz=UTC)` (create + update); `_require_clinic_hours` (create + update when `scheduled_at` changes).
- `backend/app/services/sms_resend_service.py` (#66): uses `not_in_use_reason`.
- `backend/app/api/v1/endpoints/medical_history.py` (#66, #67): redundant `get_patient` removed; BHW 403; `GET /patients/{id}/visits/prefill`.
- `backend/app/schemas/visit.py` (#67): `VisitPrefill`.
- `backend/app/utils/manila_time.py` (#68, new).
- `backend/app/schemas/appointment.py` (#68, #69): `scheduled_at_in_manila` validators; `ClinicHoursResponse`.
- `backend/app/services/sms_service.py`, `backend/app/workers/reminder_scheduler.py`, `backend/app/api/v1/endpoints/appointments.py` (#68): Manila time in SMS; (#69) `/clinic-hours` route.
- `backend/app/services/system_settings_service.py`, `backend/app/schemas/system_config.py` (#69): clinic hours settings + validation.
- `scripts/fix-appointment-timezone.sql` (#68, new, one-off, already applied in production).

### Backend tests
- New: `test_removed_patients_blocked.py` (23), `test_visit_prefill.py` (28), `test_appointment_timezone.py` (10), `test_clinic_hours.py` (23).
- Changed: `test_immunizations.py` (unknown patient 404), `test_sms.py::test_create_appointment_success` (10:00 AM Manila), `test_removed_patients_blocked.py::_appointment_payload` (10:00 AM Manila), `test_appointment_timezone.py` (10:00 instead of 21:00; `(9,"+08:00")`, `(1,"Z")`; evening test inserts `SystemSetting` 00:00/23:59).

### Frontend
- `lib/patient-status.ts` (#66, new), `lib/manila-time.ts` (#68, new), `lib/clinic-hours.ts` (#69, new), `lib/system-settings.ts` (#69).
- `app/(dashboard)/patients/[patientId]/page.tsx` (#66): "New visits paused".
- `app/(dashboard)/patients/[patientId]/visits/new/page.tsx` (#66 blocked notice, #67 prefill + BHW form).
- `app/(dashboard)/appointments/new/page.tsx` (#66 409 toast, #68 `+08:00`, #69 hours).
- `app/(dashboard)/settings/page.tsx` (#69): "Clinic opens / Clinic closes", section "Clinic, hours & reminders".
- `components/forms/AppointmentForm.tsx` (#68; unused component).
- `hooks/usePatients.ts` (#67 `fetchVisitPrefill`), `hooks/useAppointments.ts` (#69 `fetchClinicHours`), `types/patient.ts` (#67 `VisitPrefill`).
- Tests new: `tests/lib/patient-status.test.ts` (4), `tests/components/NewVisitBlocked.test.tsx` (3), `tests/components/AddVisitPrefill.test.tsx` (8), `tests/lib/manila-time.test.ts` (4), `tests/lib/clinic-hours.test.ts` (5), `tests/components/BookAppointmentHours.test.tsx` (4); changed `tests/lib/system-settings.test.ts` (+4 → 10).

### Memory
- `memory/local_db_tests.md` (+ "Run as a UTC server" paragraph), `memory/MEMORY.md` line.

### Scratchpad (session-only, will be lost: `C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\bb0b2a34-ed36-4ad1-8959-6acb6441982b\scratchpad\`)
`commit-block-removed-{backend,frontend}.txt`, `pr-body-block-removed.md`, `commit-visit-prefill-{backend,frontend}.txt`, `pr-body-visit-prefill.md`, `commit-tz-{backend,frontend}.txt`, `pr-body-tz.md`, `commit-hours-{backend,frontend}.txt`, `pr-body-hours.md`, `tzcheck.py`, `test_immunizations_head.py`, `commit-handoff-seq15.txt`.

## User Feedback & Preferences (REQUIRED)

- "#64 works" → short confirmations; trust them, verify CI/OpenAPI independently.
- Chose "Inactive + Archived (Recommended)" → accepts recommended options when the trade-off is explained in the question itself.
- "what account?" → **name the role for every browser check** (and why another role can't see it).
- "is there a way to make the 'Add Visit' more automated, so its not hustle for crud?" → wants less typing for staff; picked "Prefill from today" + "Shorter BHW form"; did **not** pick "Start visit" or "Copy past history" (yet).
- "why the appoinment process does not really solve anything??? is that really the accurate appoinment process? how they getting that there's an appoinment?" + "i cannot find it, because when i book … and when i add visit it is not auto." → frustration when a feature doesn't work as described; wants honest "how it works" plus the real root cause, not defence of the feature. Our "After merge" test steps must be ones that actually work (same-day booking!).
- Chose "Shift them back (Recommended)" and "Time fix only (Recommended)" → one problem per PR.
- Pasted full server output twice → runs server commands themselves and pastes results; give read-only queries with **no names** in output.
- "yes, limit bookings to clinic hours".
- "merged and deployed, check it first" / "check it first and tell me what's next." → always verify (CI, OpenAPI, stats) before next steps, then a short ordered list.
- "all checked and working" → closes the checks.
- "close this session and /handoff and give me the prompt i can use for the next fresh session" → prefers fresh sessions via handoff + paste prompt.
- (Carried) user commits/pushes/merges/deploys; `git commit -F <file>`; pnpm not npm; never open `.env`; say "on the server (prompt `azureuser@smarthealth-server`)"; repo public, no PHI; selects whole PR bodies in the IDE, so PR bodies must stand alone.

## Where We're Going

1. **START HERE: merge this handoff** (branch `docs/handoff-seq15`, docs only, no deploy). Commands are in the paste-prompt message of the closing session; if lost: `git switch -c docs/handoff-seq15`, `git add -- plans/handoffs/HANDOFF_visit-prefill-clinic-hours-live_2026-11-22.md`, `git commit -F <file>`, push, PR, merge.
2. **Defense items (user-only, remind once)**: manuscript wording (facts in seq 14 Appendix C; add: Add Visit prefill from appointment + intake, clinic hours, Manila-time fix if relevant); load the gateway SIM + test SMS; write the final NTAG215 from the demo patient's Print page; reprint cards printed before #50.
3. **Next PR — ask the user to pick (recommended first):**
   - **"Start visit" on today's appointments** (Appointments page rows for today + BHW/Physician dashboard today lists) → link to `/patients/{id}/visits/new` (prefill already works). Biggest remaining time saver.
   - Removed-patient SMS gaps: manual "Send SMS" (`backend/app/api/v1/endpoints/sms.py` ~199) still allows archived patients; STOP opt-out lookup (~622) only matches active patients (inactive patient's STOP not recorded).
   - Archive page "Archived by" shows a UUID (`archived/page.tsx:286`) → name via `patient_service.user_names`.
   - Clinic **days** (weekends/holidays) — bookings limited by hours only.
   - Docs: `DEV-WORKFLOW.md` §4 `pnpm dev`, §7 next migration `0033`; mention `TZ=UTC0` in §5.
4. **Optional, only if asked**: reschedule UI (backend supports PUT `scheduled_at`, no page); show appointment times explicitly in Manila (`appointments/page.tsx formatDateTime` uses the browser tz); link walk-in intake (token with `patient_id`, no appointment) to prefill; `AGENTS.md` for Codex; seq 12 cleanup list (stale comment `PatientDemographicsChart.tsx:8`, `setex` deprecations, test-file ruff findings incl. pre-existing `tests/test_immunizations.py` format diff, `set-state-in-effect` warnings, favicon 404, legacy `backend/scripts/backup_db.py`, disabled `deploy.yml`).

## Risks & Blockers

- **Prefill only uses same-day appointments**: testing with a future booking shows nothing (this confused the user once). Walk-ins without a booking get no prefill by design.
- **Appointments list times use the browser's timezone** (`toLocaleString` without `timeZone`): correct on PH devices; wrong if a viewer's device is set to another zone.
- **Weekend bookings allowed**; status updates outside hours allowed on purpose.
- **Time-of-day-dependent tests**: `test_evening_booking_today_shows_up_in_add_visit` skips after 23:00 Manila; others use fixed 10:00 AM or explicit days. Always run with `TZ=UTC0`.
- **Repair script** is one-off and already applied; re-running finds 0 rows (safe). It identifies rows via audit metadata format — don't change `appointment_service` CREATE/UPDATE audit metadata keys without considering it (only matters if re-run).
- (Carried) Docker Desktop flaky (start with `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`, poll `docker info`); VM auto-shutdown 02:00 Manila; gateway SIM has no load; CI logs unreadable by Claude; Ctrl+Shift+R after Vercel deploys.

## Open Questions

1. Which next PR: "Start visit", SMS gaps, Archive name, clinic days, or docs? (user not yet asked after the handoff)
2. Does the health center close on weekends/holidays (would need clinic days)? Are 7:00 AM–5:00 PM the real hours (Admin can change on Settings)?
3. (Carried) `AGENTS.md` for Codex sessions?

## Tooling Gotchas (cost time this session)

- **Never `git commit` while `GIT_INDEX_FILE` points at a scratch index** — it commits for real (made `12e3ef9 tmp`, undone with `git reset --soft HEAD~1`). Stats recipe: `cp .git/index $S/ix; GIT_INDEX_FILE=$S/ix git add -- <paths>; GIT_INDEX_FILE=$S/ix git diff --cached --shortstat; rm $S/ix`.
- **`sed -i` in Git Bash rewrites CRLF files to LF** (`visit_service.py`). Use the Edit tool or Python with `newline=""`; check `file <path>` after edits.
- **First red can be an ImportError**: add a stub (function returning None) to get behavioural reds.
- **Proving frontend reds after writing code**: `cp page.tsx $S/page.mine; git show HEAD:frontend/web/<path> > <path>; pnpm exec vitest run <test>; cp $S/page.mine <path>` (no stash; `stash@{0}` must stay untouched).
- **Feature branch after a merge**: `git diff --quiet HEAD origin/main -- backend frontend scripts && git switch -c <new> origin/main --no-track && git branch -f main origin/main` (works because merged trees are identical; uncommitted user files carry over).
- **Timezone**: Git Bash `TZ=UTC0 python …` makes Python/asyncpg behave like the UTC server on Windows. Full suite: `TZ=UTC0 DATABASE_URL=… REDIS_URL=… python -m pytest -p no:warnings -o addopts="" -q`.
- **Backend deploy proof**: only possible from outside when OpenAPI changes (new route/field); otherwise ask for Admin → System Health version (= `GIT_COMMIT` short hash).
- **`SMSService` imported inside the send-reminder function** → patch `app.services.sms_service.SMSService`, not the endpoint module.
- **Static routes before `/{id}`**: `/appointments/clinic-hours` (like `/patients/inactive`) or it 422s as an invalid UUID.
- **Test DB isolation**: `db_session` uses SAVEPOINT rollback per test, so settings rows written in one test don't leak.
- **Scratch DB for SQL scripts**: `docker exec shh-test-pg psql -U shh_test -d smarthealthhub_test -c "CREATE DATABASE x"`, then `DATABASE_URL=…/x python -m alembic upgrade head` from `backend/`, then `docker exec -i shh-test-pg psql -U shh_test -d x < script.sql`, then drop.

### Commands that worked
```bash
# CI + Vercel for main (PC, Bash tool)
SHA=$(git rev-parse origin/main)
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/$SHA/check-runs" | python -c "import sys,json; [print(r['name'],r['status'],r['conclusion']) for r in json.load(sys.stdin)['check_runs']]"
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/$SHA/status" | python -c "import sys,json; print(json.load(sys.stdin)['state'])"
# Wait for CI (background-friendly loop, 20 s steps)
for i in $(seq 1 60); do OUT=$(curl -s ".../check-runs" | python -c "...print(pending count)..."); [ "$(echo "$OUT"|head -1)" = 0 ] && break; sleep 20; done
# Is a route live?
curl -s https://smarthealth-hub.japaneast.cloudapp.azure.com/openapi.json | python -c "import sys,json; print('/api/v1/appointments/clinic-hours' in json.load(sys.stdin)['paths'])"
# Test DB + full suite as the server (Bash, backend/)
docker run -d --rm --name shh-test-pg -e POSTGRES_USER=shh_test -e POSTGRES_PASSWORD=shh_test -e POSTGRES_DB=smarthealthhub_test -p 127.0.0.1:5499:5432 postgres:18-alpine
docker run -d --rm --name shh-test-redis -p 127.0.0.1:6399:6379 redis:7-alpine
TZ=UTC0 DATABASE_URL="postgresql+asyncpg://shh_test:shh_test@127.0.0.1:5499/smarthealthhub_test" REDIS_URL="redis://127.0.0.1:6399/0" python -m pytest -p no:warnings -o addopts="" -q
docker stop shh-test-pg shh-test-redis
# Frontend (frontend/web)
pnpm exec tsc --noEmit; pnpm run lint; pnpm run test; pnpm run build; git checkout -- next-env.d.ts
# Server (prompt azureuser@smarthealth-server, from /opt/smarthealth-hub)
bash scripts/deploy.sh
dc exec backup sh /scripts/backup.sh now
dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/fix-appointment-timezone.sql
```

## Timeline (user prompt → outcome)

| # | User said | Outcome |
|---|---|---|
| 1 | Paste prompt (seq 14) | Onboarding narrated; #65 already merged; gaps found; waited |
| 2 | "#64 works" | Asked block scope → Inactive + Archived; built #66 (640 / 224) |
| 3 | "merged and deployed, check it first" | CI green `ed1d063`; asked for browser checks |
| 4 | "what account?" | Admin for System Health, Physician for visit checks |
| 5 | "make the 'Add Visit' more automated…" | Options → prefill + BHW form; built #67 (668 / 232) |
| 6 | "why the appoinment process does not really solve anything???… it is not auto" | Found 8 h UTC bug; asked → shift back + time fix only; built #68 + repair script (678 / 236) |
| 7 | "merged and deployed, check it first" | CI green `9b6f02b`; asked for System Health + script output |
| 8 | Pasted preview + apply output | 2 rows fixed; asked for audit query |
| 9 | Pasted audit query output | 12:00 AM slip + Nov 30 (not today) explained; offered clinic hours |
| 10 | "yes, limit bookings to clinic hours" | Built #69 (701 / 249) |
| 11 | "merged and deployed, check it first and tell me what's next." | Verified (OpenAPI route live), next-steps list |
| 12 | "all checked and working" + "close this session and /handoff…" | This file |

## Quick Start for Next Session

```bash
# Reference docs
cat plans/handoffs/HANDOFF_visit-prefill-clinic-hours-live_2026-11-22.md
cat CLAUDE.md
cat DEV-WORKFLOW.md   # §4 says npm (use pnpm), §7 migration number stale (next 0033)

# Key files (explore adjacent code too)
backend/app/services/visit_service.py              # visit_prefill, intake_chief_complaint, create_visit guard
backend/app/services/appointment_service.py        # require_patient_in_use, _require_clinic_hours, Manila future check
backend/app/services/system_settings_service.py    # clinic hours settings
backend/app/utils/manila_time.py                   # assume_manila / to_manila
frontend/web/app/(dashboard)/patients/[patientId]/visits/new/page.tsx
frontend/web/app/(dashboard)/appointments/new/page.tsx

# Verify current state (PowerShell on PC)
git fetch --prune; git switch main; git pull; git log --oneline -3     # expect c09db3e (+ handoff merge)
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health
# Backend: TZ=UTC0 full suite (Commands that worked) → expect 701 passed; frontend: cd frontend/web; pnpm run test → expect 249

# Next action
# Confirm the seq 15 handoff PR is merged, remind the defense items once, then ask the user which next PR (recommend "Start visit").
```

## Appendix A: API quick reference (added / changed this session, as of `c09db3e`)

| Method + path | Roles | Body / query | Success | Errors | Audit |
|---|---|---|---|---|---|
| `GET /api/v1/patients/{id}/visits/prefill` | physician, bhw | — | 200 `VisitPrefill` (all null when no appointment today) | 404 unknown patient; 403 admin/admin_staff | `VIEW_PHI` `entity_type="visit_prefill"` metadata `{appointment_id}` only when intake answers were read |
| `POST /api/v1/patients/{id}/visits` | physician, bhw | `VisitCreate` | 201 | **403** bhw with non-blank diagnosis/treatment_notes; **409** inactive/archived; 404 | CREATE visit |
| `POST /api/v1/patients/{id}/immunizations` | bhw, physician, admin, admin_staff | `ImmunizationCreate` | 201 | **409** inactive/archived; **404** unknown (was 409 FK) | CREATE immunization |
| `POST /api/v1/patients/{id}/medical-history` | physician | `MedicalHistoryCreate` | 201 | **409** inactive/archived; 404 | CREATE medical_history |
| `POST /api/v1/appointments` | admin, bhw, physician | `scheduled_at` with or without tz (naive = Manila) | 201 | **409** inactive/archived; **422** past or outside clinic hours; 404 | CREATE appointment (metadata `scheduled_at` isoformat, now always with offset) |
| `PUT /api/v1/appointments/{id}` | admin, bhw, physician | any subset; `scheduled_at` naive = Manila | 200 | **422** past / outside hours (only when `scheduled_at` sent) | UPDATE appointment `{changed_fields}` |
| `GET /api/v1/appointments/clinic-hours` | admin, bhw, physician, admin_staff | — | 200 `{"open_time":"07:00","close_time":"17:00"}` | 401 anonymous | none (no PHI) |
| `GET/PUT /api/v1/system/settings` | admin | `clinic_open_time`, `clinic_close_time` ("HH:MM" or null = default) | 200 `SystemSettingsResponse` (+2 `SettingValue`) | 422 bad format / closing ≤ opening | UPDATE system_settings `{changes: {key: {from, to}}}` |

## Appendix B: Exact UI and API strings added this session

| Where | Text |
|---|---|
| 409 inactive | "The patient is inactive. Reactivate them on the Inactive Patients page first." |
| 409 archived | "The patient is archived. Restore them from the Patient Archive first." |
| Patient page (instead of "+ Add Visit") | "New visits paused (inactive)" / "New visits paused (archived)" (title = the 409 text) |
| New Visit page, removed patient | "No new visits for {name}" + the 409 text + "Their earlier visits are still on the patient record." + link "Back to patient profile" |
| Add Visit prefill note (role=status) | "Filled in from today's {General Check-up / Prenatal / Follow-up / Vaccination} appointment at {9:00 AM} and the patient's intake form. Check the details before saving." (the "and the patient's intake form" part only when a chief complaint was drafted) |
| BHW clinical notes | "After you save, the visit goes on the Physician's waiting list and the Physician adds the diagnosis and treatment." + `<details>` "Add past / present medical history (optional)" |
| 403 BHW diagnosis | "Only a Physician can record the diagnosis and treatment notes. Save the visit without them; the Physician adds them from their waiting list." |
| 422 outside hours | "Appointments can only be booked during clinic hours, {7:00 AM} to {5:00 PM}. Pick a time in that range (check AM / PM)." |
| 422 settings | "The closing time must be after the opening time." |
| Book Appointment hint | "Clinic hours: 7:00 AM to 5:00 PM" (under Time; `min`/`max` on the picker) |
| Settings fields | section "Clinic, hours & reminders"; "Clinic opens", "Clinic closes"; hint "Appointments can only be booked from opening time until closing time (Manila time)."; client problems "Pick an opening time", "Pick a closing time", "Closing time must be after the opening time"; page intro "Clinic name, clinic hours, reminder timing and SMS text. Every change is recorded in the Audit Log." |
| Book Appointment toast | server text for 409 and for 422 whose message is not "Request validation failed"; otherwise "Failed to book appointment. Please try again." |

## Appendix C: Intake form data the prefill reads

- Stored `visit_purpose` values (from `app/intake/[token]/page.tsx` `VISIT_PURPOSES`): "General Consultation", "Immunization / Vaccination", "Prenatal / Maternal Care", "Family Planning", "Dental Services", "TB-DOTS Program", "Child Health / Growth Monitoring", "Hypertension / BP Monitoring", "Diabetes Management", "Wound Care / Dressing", "Nutrition Counseling", "Senior Citizens Health Check", "Medical Certificate", "Others" (free text in `draft_data.visit_purpose_other`). A real draft therefore starts with these long values (tests used shorter invented ones).
- `purpose_details` schemas (`backend/app/schemas/intake.py`): `GeneralConsultationDetails` (chief_complaint, duration_of_illness, current_medications, has_fever, has_cough, has_difficulty_breathing), `ImmunizationDetails`, `PrenatalDetails` (has_hypertension, has_gestational_diabetes, …), `FamilyPlanningDetails` (reason_for_visit), `DentalDetails` (chief_dental_complaint, duration_of_pain, has_bleeding_gums), `TBDotsDetails` (has_cough_2_weeks, has_hemoptysis, has_night_sweats, has_weight_loss, has_close_contact), `ChildHealthDetails` (concern), `HypertensionDetails` (reported_bp_systolic/diastolic — **not** prefilled, current_medications, has_headache, has_dizziness, has_chest_pain), `DiabetesDetails`, `WoundCareDetails`, `NutritionDetails`, `SeniorHealthDetails`, `MedicalCertificateDetails`, `OthersDetails`.
- Intake link → appointment: `PatientIntakeToken.appointment_id`; "submitted" = `draft_data IS NOT NULL`. List endpoint `GET /appointments` does **not** include `intake_summary`; only `GET /appointments/{id}` does.
- Physician "waiting for diagnosis" list (`dashboard_service.build_physician`): today's visits of active patients with `diagnosis IS NULL`, oldest first.

## Appendix D: Manuscript facts verified this session (for the user's thesis text)

| Item | Fact |
|---|---|
| Removed patients | Deactivated or archived patients receive no SMS (#64) and accept no new visits, immunizations, medical history entries or appointments (#66); records stay readable and restorable. |
| Add Visit | On the appointment day, the visit type and a chief-complaint draft are filled from the booking and the patient's pre-visit intake form; staff confirm before saving (#67). |
| Role split | BHWs record visit type, complaint and vital signs; only Physicians record and read diagnosis/treatment (enforced by the API, 403) (#67, Admin model B). |
| Time handling | All appointment times are Manila time (UTC+8) end to end; SMS texts show Manila time (#68). |
| Clinic hours | Appointments can only be booked within Admin-set clinic hours (default 7:00 AM–5:00 PM); changes are audited (#69). |
| Testing | Backend suite 701 tests (run in UTC like production), frontend 249 tests; CI runs pytest, mypy, ruff, ESLint, tsc, Next.js build and Docker build on every PR. |

## Appendix E: Options offered and not (yet) chosen

| Question | Options | Chosen |
|---|---|---|
| Block scope (#66) | Inactive + Archived / Inactive only / Skip | Inactive + Archived |
| Add Visit (#67, multi) | Prefill from today / Shorter BHW form / 'Start visit' buttons / Copy past history | first two |
| Old bookings (#68) | Shift them back / Leave them, I'll rebook | Shift them back |
| Scope (#68) | Time fix only / Add Start visit too | Time fix only |
| Clinic hours | offered as follow-up ("e.g. 7:00 AM to 5:00 PM") | yes → #69 |
| After #69 | handoff / "Start visit" / SMS gaps / Archive name / clinic days / docs | handoff (this file); next PR not chosen |

## Session Closed
**Closed at:** 2026-11-22 (Manila, UTC+8), after #69 was merged (`c09db3e`, CI green), deployed (clinic-hours route live in production OpenAPI) and checked by the user ("all checked and working")
**Commit:** the `session: visit-prefill-clinic-hours-live` commit on branch `docs/handoff-seq15` that includes this note (run by the user from the commands Claude provided; merge via PR, docs only, no server update needed)
**Session status:** Handed off to next session
