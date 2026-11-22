# Start visit (#71), plain-language System Health + QR ready on open (#72), archived patients out of daily lists (#73): all merged and deployed; next: probable 7 AM bug in the missed-appointment SMS job, then SMS gaps / Archive name / clinic days / docs

**Date:** 2026-11-22
**Status:** COMPLETED (3 feature PRs + 1 handoff PR merged this session; #71 and #72 deployed and checked by the user; #73 merged, deployed and CI green on `544599a` at 23:47, user browser check pending)
**Bead(s):** none (`bd` CLI not installed on this PC: `bash: bd: command not found`)
**Epic:** Deploy SmartHealth Hub to production and harden it for the thesis defense (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `16`
**Parent:** `HANDOFF_visit-prefill-clinic-hours-live_2026-11-22.md` (seq 15; the session started from its paste prompt)
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > `HANDOFF_nfc-backups-done_2026-11-19.md` > `HANDOFF_phase9-system-health-done_2026-11-19.md` > `HANDOFF_phase10-admin-model-b-done_2026-11-19.md` > `HANDOFF_allergies-media-banner-done_2026-11-20.md` > `HANDOFF_sidebar-and-admin-next_2026-11-20.md` > `HANDOFF_admin-security-settings-done_2026-11-20.md` > `HANDOFF_reliability-done-deploy-pending_2026-11-20.md` > `HANDOFF_signin-hardening-dashboard-next_2026-11-21.md` > `HANDOFF_role-dashboards-live_2026-11-21.md` > `HANDOFF_review-fixes-live_2026-11-22.md` (seq 12) > `HANDOFF_filipino-sms-copy-in-progress_2026-11-22.md` (seq 13, Codex) > `HANDOFF_inactive-patients-live_2026-11-22.md` (seq 14) > `HANDOFF_visit-prefill-clinic-hours-live_2026-11-22.md` (seq 15) > this

> ⚠️ This repo is **PUBLIC**. This file contains no passwords, keys, email
> addresses, phone numbers, patient names/codes, staff names, OTP codes or NFC
> signatures. Names in tests ("Ana Reyes", "Bea Santos", "Early Mother",
> "Stored Away", "Inuse/Paused/Stored") are invented.

---

## Stale References

Statements in the parent (seq 15) that changed on purpose this session:

- Parent: "`GET /appointments` from_date / to_date" filtered with `func.date(Appointment.scheduled_at)` → **now `_manila_day(Appointment.scheduled_at)`** (`appointment_service.list_appointments`, #71). The same UTC `func.date(Appointment.scheduled_at) == today` pattern **still exists** in `backend/app/workers/reminder_scheduler.py:420` (missed-appointment follow-up SMS). Not fixed; see Where We're Going step 1.
- Parent: BHW dashboard `appointments_today_count, _rows = await _appointments_on(..., 0)` (count only) → **now returns `appointments_today` rows** (`LIST_LIMIT` = 10). `_rows` still exists once in `dashboard_service.py:620` (admin_staff tomorrow count; unrelated, correct).
- Parent: `dashboard_service._active_patient()` = `Patient.is_active.is_(True)` → **now `and_(is_active, archived_at IS NULL)`** (#73). Every dashboard list/count changed meaning (archived patients left out). Admin "Active patients" now equals the Patients page total.
- Parent: Physician dashboard "Today's appointments" rows were one `<Link>` to `/appointments/{id}` → now `components/dashboard/TodayAppointments.tsx` (`TodayAppointmentsPanel`): row link + separate **Start visit** link.
- Parent: Registration QR page had "Generate Pre-Visit Link" / `handleGenerate` / empty state → **rewritten** (#72): auto-load via `GET /patients/intake-token/current`, **New link** button. (`handleGenerate` still appears in health-card pages; unrelated.)
- Parent: System Health page had `HealthCard` / `PILL` / `BANNER` → **rewritten** (#72): `STATUS_LOOK`, `HERO`, `CheckCard`, `NeedsAttention`, `GroupSection`, `HeartbeatTrace`. (`HealthCard*` names elsewhere are the patient health-card feature; unrelated.)
- Parent test counts "701 / 249" → now **719 passed + 1 skipped / 275**.
- Parent: `DEV-WORKFLOW.md` §4 `npm run dev` (line 108) and §7 next migration `0029` (lines 200-206): **still stale** (head `0032`, next `0033`; no migration this session either).

## Since Last Handoff

- **Parent step 1 (merge seq 15 handoff)**: done by the user as PR **#70** (`a0aa9c1`) right after onboarding ("merged #70, go ahead with Start visit").
- **Parent step 2 (defense items reminder)**: reminded once during onboarding (manuscript wording, gateway SIM load + test SMS, final NTAG215 for the demo patient, reprint pre-#50 cards). No user reply on them; still user-only.
- **Parent step 3 (next PR, recommended "Start visit")**: done as **#71**, plus the onboarding-found date-filter bug in the same PR (separate concern, same backend commit).
- **New user requests not in the parent plan**: System Health redesign + Registration QR "displayed already but can be regenerated" + UI/UX (#72).
- **Parent follow-up list item "archived patients"** (new finding from #71's PR body: archived patients still got Start visit) → **#73**, chosen by the user as option 1 of 5.
- **Parent open question 1 (which next PR)**: answered: Start visit, then UI redesign, then archived fix.
- **Parent open question 2 (weekends/holidays, real clinic hours)**: still unanswered.
- **Trajectory**: still defense hardening + polish. Same rhythm: build → user merges/deploys → "check it first" → user browser-checks → "all checked and working" → next.

## Reference Documents

- `CLAUDE.md`: conventions (Admin model B, audit every write, Alembic-only schema changes, AES-256-GCM fields, module boundaries, no PHI on NFC/QR).
- `DEV-WORKFLOW.md`: §3 git, §4 local dev (says npm; use pnpm), §5 CI checks + Docker test DB, §6 `deploy.sh`, §7 migrations (number stale), §9 server cheat sheet, §10 backups, §13 agreements.
- `docs/SmartHealth_Hub_System_Development_Plan.md` (git-ignored, local): authoritative scope.
- Parent: `plans/handoffs/HANDOFF_visit-prefill-clinic-hours-live_2026-11-22.md` (#66-#69 internals; Appendix A API table; Appendix B UI strings; Appendix C intake data; Appendix D manuscript facts).
- Claude memory (`C:\Users\githu\.claude\projects\c--Users-githu-OneDrive-Documents-smarthealth-hub\memory\`): unchanged this session (`local_db_tests.md` already says run with `TZ=UTC0`).

## The Goal

SmartHealth Hub (thesis: Barangay Health Center records with NFC/QR health cards, SMS reminders, OTP MFA) runs in production for the thesis defense: website `https://smarthealth-hub-two.vercel.app` (Vercel, auto-deploys on merge to `main`), API `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose, deployed by the user with `bash scripts/deploy.sh` **on the server**). This session cut staff clicks further (**Start visit** from today's appointments straight into the prefilled Add Visit), fixed a Manila-vs-UTC date bug in the Appointments date filter, made the Admin **System Health** page readable by a non-technical admin, made the **Registration QR** page ready on open, and removed archived patients from all dashboard work lists. Remaining: user-only defense items, a probable 7 AM bug in the missed-appointment SMS job (found at handoff time), and small follow-ups the user picks from.

## Where We Are

### Production (verified at handoff time, 2026-11-22 ~23:44 Manila)
- `origin/main` = **`544599a`** (merge of #73). Local branch: `fix/archived-start-visit` (merged; same tree as main). Local `main` was force-pointed to `origin/main` at each branch creation (`git branch -f main origin/main`), last at `4a1e7ff`; run `git switch main; git pull` next session.
- CI on `544599a`: at 23:44 tsc + pytest were still running; **re-checked at 23:47: all green** (pytest ✅, mypy ✅, lint BE ✅, lint FE ✅, tsc ✅, FE build ✅, Docker ✅, changelog skipped); Vercel ✅.
- CI on `4a1e7ff` (#72) and `6056e01` (#71): all green (changelog skipped as usual), Vercel ✅.
- Production OpenAPI: `AppointmentResponse.patient_not_in_use_reason` ✅ (#73 backend deployed), `/api/v1/patients/intake-token/current` ✅ (#72; anonymous GET → 401), `BhwDashboard.appointments_today` ✅ and `from_date` description "First Manila day of scheduled_at, inclusive (YYYY-MM-DD)" ✅ (#71). `/health` → `{"status":"ok","service":"smarthealth-hub-api","version":"0.1.0"}`.
- **User browser checks**: #71 + #72 "all checked and working". **#73 not yet browser-checked** (user said "merged and deployed, check it first" then asked for the handoff because the VM shuts down at 12 AM).

### What exists now (by PR)
- **#71 Start visit** (`670fe58` backend, `3d11480` frontend, merge `6056e01`):
  - `appointment_service.list_appointments`: `from_date`/`to_date` compare `_manila_day(Appointment.scheduled_at)` (was `func.date(...)` = DB session date = UTC in the `postgres:18` container → 7:00-7:59 AM Manila bookings counted as the previous day).
  - `GET /dashboard/me` BHW: `appointments_today: list[AppointmentRow]` (first `LIST_LIMIT`=10, earliest first; statuses `OPEN_DAY_STATUSES` = pending/confirmed/completed/missed; active patients only).
  - `frontend/web/lib/start-visit.ts`: `OPEN_STATUSES` (pending/confirmed/missed = backend `VISIT_COMPLETES_STATUSES`), `manilaDate(iso)`, `canStartVisit(role, {status, scheduledAt, patientNotInUseReason?}, today=manilaToday())`, `startVisitHref(patientId)` → `/patients/{id}/visits/new`.
  - `components/dashboard/TodayAppointments.tsx` → `TodayAppointmentsPanel({rows, count, today, role, index, className})` used by Physician and BHW dashboards ("Showing the first N of M" footer).
  - Appointments page: **Today** button (sets both dates to `manilaToday()`, `aria-pressed`), **Start visit** in row actions.
  - Appointment page: **Start visit** at top of Actions + note "Opens Add Visit, filled in from this appointment. Saving the visit marks the appointment completed."
- **#72 UI** (`b37ca7b` backend, `b104dfc` frontend, merge `4a1e7ff`):
  - `intake_service.current_walk_in_token(db, created_by_id)` + `GET /patients/intake-token/current` (roles `_BHW_PLUS` = bhw, physician, admin_staff, admin) → `IntakeTokenResponse | None`.
  - System Health page rewritten (plain-language groups, hero with heartbeat trace, Needs your attention list).
  - Registration QR page rewritten ("Pre-Visit Form QR"; QR + link on open; New link; scan frame; How it works; public link card).
  - `globals.css`: `.health-trace` keyframes (`stroke-dasharray: 0.4 0.6`, 3.6 s), off under `prefers-reduced-motion`.
- **#73 archived** (`65d6ae1` backend, `3455d0c` frontend, merge `544599a`):
  - `dashboard_service._active_patient()` = not deactivated AND not archived.
  - `AppointmentResponse.patient_not_in_use_reason: str | None` = `patient_service.not_in_use_reason(patient)` (list + detail).
  - Frontend: `Appointment.patientNotInUseReason`, `startVisitBlockedReason(role, appt, today)`; Appointments page chip "Patient archived"/"Patient inactive" (title = full reason); Appointment page note "No new visits for this patient" + reason.

### Tests
- Backend full suite under `TZ=UTC0`: **719 passed, 1 skipped** (session start 701; #71 705; #72 714+1 skip; #73 719+1 skip). The skip is `test_evening_booking_today_shows_up_in_add_visit`, which skips itself after 23:00 Manila (ran late at night).
- Frontend vitest: **275 passed / 40 files** (session start 249; #71 262; #72 271; #73 275). Lint **0 errors / 80 warnings** (81 before #72; the old QR page had one). `tsc --noEmit` clean. `next build` OK each time.

### Local state (uncommitted on purpose; never commit without asking)
- `README.md` (user's ssh line), `backend/celerybeat-schedule-shm`, `backend/celerybeat-schedule-wal`, `START.md`, `dump.rdb`, `start-tunnel.ps1`. `stash@{0}` ("WIP on main: d041507 …") still present — never drop.
- Docker test containers `shh-test-pg` / `shh-test-redis` **stopped** (`--rm`, gone).
- This handoff: untracked until the user runs the close commands (branch `docs/handoff-seq16`).

## What We Tried (Chronological)

1. **Onboarding** (paste prompt from seq 15). `bd` not installed. `git fetch`: `origin/main` = `c09db3e`, CI 7/7 green + Vercel; `/health` ok; PR **#70** (seq 15 handoff) still open. Read `manila_time.py`, `visit_service.visit_prefill`/`intake_chief_complaint`, `appointment_service` (`_require_clinic_hours`, `list_appointments`, `update_appointment`, `complete_appointments_for_visit`, `_manila_day`), `appointments/page.tsx`, `permissions.ts`, `dashboard_service` (`_appointments_on`, `build_bhw`), `PhysicianDashboard.tsx`, `BhwDashboard.tsx`. **Found** the `list_appointments` UTC date-filter bug (lines 376-379) while `_manila_day` sat a few lines below. Waited for go-ahead.
2. **User: "merged #70, go ahead with Start visit"**. Branch `feat/start-visit` from `origin/main` (`a0aa9c1`; trees equal check). Started containers; `docker exec shh-test-pg psql -tAc "SHOW timezone"` → **`UTC`** (same image as production, whose `db` service has no `TZ`) = proof the date bug is real. Baseline **701 passed** (179.9 s).
3. **#71 backend TDD**: `tests/test_start_visit.py` (4) red **4 failed** (2× `KeyError: 'appointments_today'`; 2× date filter sets wrong: the 7:30 AM booking missing, next-morning 7:30 included). Implemented; related suites **56 passed** (UTC) and new file 4 passed under `TZ=Asia/Manila` too. Full **705 passed** (264 s). `ruff format` reflowed one test signature.
4. **#71 frontend**: wrote lib + panel + page edits before tests (baseline run was still going). Tests: `start-visit.test.ts` (5), `StartVisitAppointments.test.tsx` (5), `StartVisitDashboard.test.tsx` (3). **Gotcha**: the detail-page negative test first passed possibly vacuously (React warned "A component suspended inside an `act` scope, but the `act` call was not awaited" — `use(params)` may not have resolved) → rewrote to `await act(async () => { ({unmount} = render(...)) })` and assert the `h1` "Ana Reyes" renders before checking no Start visit. Red vs old pages (old `appointments/page.tsx`, `[appointmentId]/page.tsx`, `PhysicianDashboard.tsx`, `BhwDashboard.tsx`, `types/dashboard.ts` restored from HEAD, new lib kept): **5 failed / 3 passed** (the 3 = "must NOT show" guards). 262 passed; build OK.
5. **User: "merged and deployed, check it first, and … system health … easier … fit icons … registration-qr … displayed already but can be regenerate … improvise the ui/ux"**. Verified #71 (CI, OpenAPI `BhwDashboard.appointments_today`, from_date description, stats 15 files +690/−31 = built 5+10 files, 195+495 / 9+22).
6. **#72 design decision**: auto-POST on every page open would create a new one-time token per visit/refresh (and React dev double-effects). Chose a read-only `GET /patients/intake-token/current` returning the user's newest usable walk-in token. Walk-in = `appointment_id IS NULL` and `patient_id IS NULL` (confirmed from `intake_service.generate_intake_token`, which sets neither). Per-user (`created_by_id`) so two staff on two devices don't show the same one-time link.
7. **#72 backend TDD**: `tests/test_intake_token_current.py` (10) red **9 failed / 1 passed** (404 everywhere; "reading creates nothing" passes trivially). Implemented; first green run **1 failed** `KeyError: 'intakeUrl'` → the API returns **snake_case** (`intake_url`, `expires_at`); fixed the test. 10 passed; ruff format fixed the test file; full **714 passed, 1 skipped** (the evening test skipped because it was after 23:00 Manila).
8. **#72 frontend**: loaded the `frontend-design:frontend-design` skill; direction = stay inside the existing "warm clinical editorial" theme (`components/dashboard/shared.tsx`: `IconBadge`, `TONE`, `rise`, `text`; DM Serif `font-display`) with one signature element per page (heartbeat trace; QR scan-frame corners). **Build gotcha avoided**: `export const STATUS_LOOK` in a Next.js `page.tsx` is not a valid page export → made it a plain `const`. Verified icons exist in the installed lucide (`MemoryStick`, `Siren`, `GitCommitHorizontal`, `ShieldX`, `ShieldQuestion`, `LockKeyhole`, `Images`; **`Facebook` does not exist** → used `Globe`). Verified copy: media check message is "Patient photos and health-card PDFs."; public link sign-ups go to Registrations → **Online Applications** (admin-only tab); removed an unverifiable "takes about 5 minutes".
9. **#72 tests**: `SystemHealthPage.test.tsx` (3), `RegistrationQrPage.test.tsx` (6; mocks `qrcode` — jsdom has no canvas — and `sweetalert2`). Red vs old pages: **8 failed / 1 passed** (public link already shown). 271 passed; lint 80 warnings; build OK.
10. **User: "merged and deployed, check it first"** → CI/Vercel green on `4a1e7ff`, `/current` route live (401 anon), stats 8 files +1272/−621 = built (3 backend +214; 5 frontend +1058/−621). Tried to prove the Vercel page chunks contain the new code: pages answer **307 → /login** when not signed in, so chunk contents can't be read anonymously; relied on Vercel success. Gave browser checks + next-steps list (1 archived Start visit, 2 SMS gaps, 3 Archive name, 4 clinic days, 5 docs).
11. **User: "all checked and working, go with 1"**. Branch `fix/archived-start-visit` from `origin/main` (`4a1e7ff`). Found: `archive_patient` does not touch appointments; Patients page hides archived (`patient_service.py:216 Patient.archived_at.is_(None)`); dashboards only checked `is_active` → archived patients in every dashboard list and in the Admin "Active patients" count. Chose to broaden `_active_patient()` (one source of truth) rather than patch only `_appointments_on`.
12. **#73 TDD**: `tests/test_archived_not_in_daily_work.py` (5) red **5 failed** (`assert 2 == 1` ×4; `KeyError: 'patient_not_in_use_reason'`). Implemented; related **75 passed, 1 skipped**; full **719 passed, 1 skipped** (290.9 s). Frontend: first chip used `reason.includes("archived")` → replaced with `=== ARCHIVED_PATIENT_MESSAGE` (constant from `lib/patient-status.ts`). Tests +4; red vs old (5 files restored) **2 failed / 5 passed**. 275 passed; build OK.
13. **User: "merged and deployed, check it first, and … /handoff because 12AM the VM will close"** → `544599a` merged; OpenAPI shows `patient_not_in_use_reason`; Vercel success; tsc + pytest checks still running at 23:44; stats 11 files +300/−8 = built (4 backend +205/−1; 7 frontend +95/−7). While checking stale refs for this handoff, **found `reminder_scheduler.py:420`** uses `func.date(Appointment.scheduled_at) == today` with `today = datetime.now(tz=UTC).date()` (see Risks).

## Key Decisions

- **Fix the date filter inside the Start visit PR** (own explanation in the PR, same backend commit): a "Today" view is only correct with Manila days. Reused the existing `_manila_day()` helper instead of a second implementation.
- **BHW dashboard gets the same today list as Physician** (`_appointments_on(..., LIST_LIMIT)`), not a new endpoint; frontend shows the panel only when the field exists (Vercel deploys before the backend).
- **Start visit only for Physician + BHW** (`canLogVisit`), **today (Manila)**, **pending/confirmed/missed** (what a visit completes). Completed/cancelled rows keep the row link but no button. Admin/Admin Staff never see it (Admin model B).
- **Start visit is a plain link to `/patients/{id}/visits/new`** (no appointment id in the URL): the prefill endpoint already picks the earliest same-day appointment; saving the visit already completes the day's appointments.
- **"Today" quick filter** added on the Appointments page (small, makes the feature findable).
- **QR page: read-before-create** (`GET …/current`, else POST) rather than POST on every open; per-user; at least 1 hour left (`_CURRENT_LINK_MIN_REMAINING = timedelta(hours=1)`); excludes used, drafted, appointment-linked and patient-linked tokens. Replaced links are **not** invalidated (they still work for whoever has them) — said so on the page. Fallback to POST on 404/405 for the deploy gap. `useRef` guard so React dev double-effects don't create two tokens.
- **No audit row for `GET …/current`**: returns only token + expiry (no PHI); creating tokens wasn't audited before either.
- **System Health: plain names first, technical names small** ("Sign-in codes and job queue" / Redis; "Background jobs" / Celery; "Patient database" / PostgreSQL); status words "Working / Needs a look / Not working / Can't tell" with icons (not colour alone); same tints as Admin dashboard tile (`STATUS` there uses "Healthy / Needs attention / Problem / Unknown" — slight wording difference, intentional for plainer page words; not unified).
- **Archived = out of daily work everywhere on the dashboards** (broadened `_active_patient`), matching the Patients page and the SMS rules (#64). Rejected: patching only today's appointments (would leave archived patients in "Immunizations due", "Missed appointments", "Without a card", Admin count).
- **Appointment responses carry the reason text**, not a status enum: single source `patient_service.not_in_use_reason` (same as the 409), frontend just displays/compares constants.
- **One PR per request, two commits each (backend, frontend)**; user commits/pushes/merges/deploys from commands + `git commit -F` files in the scratchpad.

## Evidence & Data

### PRs this session
| PR | Branch | Commits | Merge | Backend files +/− | Frontend files +/− |
|---|---|---|---|---|---|
| #70 | docs/handoff-seq15 | `e5063f0` session handoff seq 15 | `a0aa9c1` | — | — |
| #71 | feat/start-visit | `670fe58` feat(appointments): today's appointments for BHWs; date filter uses the Manila day; `3d11480` feat(appointments): "Start visit" on today's appointments | `6056e01` | 5, +195/−9 | 10, +495/−22 |
| #72 | feat/health-and-qr-ui | `b37ca7b` feat(intake): GET /patients/intake-token/current for the Registration QR page; `b104dfc` feat(ui): plain-language System Health; Registration QR ready on open | `4a1e7ff` | 3, +214/−0 | 5, +1058/−621 |
| #73 | fix/archived-start-visit | `65d6ae1` fix(dashboard): archived patients are out of daily work lists; `3455d0c` fix(appointments): no Start visit for archived or inactive patients | `544599a` | 4, +205/−1 | 7, +95/−7 |

Merged stats verified against built stats each time (`git diff --stat <prev-merge> origin/main -- backend frontend`): #71 15 files +690/−31; #72 8 files +1272/−621; #73 11 files +300/−8.

### CI per merge commit
| Commit | pytest | mypy | lint BE | lint FE | tsc | FE build | Docker | Vercel |
|---|---|---|---|---|---|---|---|---|
| `c09db3e` (session start) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `6056e01` (#71) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `4a1e7ff` (#72) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `544599a` (#73) | ✅ (23:47) | ✅ | ✅ | ✅ | ✅ (23:47) | ✅ | ✅ | ✅ |

### Test count history
| Point | Backend (`TZ=UTC0`) | Frontend | Notes |
|---|---|---|---|
| Session start | 701 (179.9 s) | 249 | from seq 15 |
| #71 | **705** (264.5 s) | **262** | +4 / +13 |
| #72 | **714 + 1 skipped** (184.4 s) | **271** (40 files) | +10 / +9; skip = evening test after 23:00 |
| #73 | **719 + 1 skipped** (290.9 s) | **275** | +5 / +4 |

### Red → green per PR
| Test file | Red | Why red |
|---|---|---|
| `backend/tests/test_start_visit.py` | 4 failed | BHW `appointments_today` missing (KeyError ×2); 7:30 AM booking on wrong day (×2) |
| `StartVisitAppointments.test.tsx` + `StartVisitDashboard.test.tsx` (vs old pages) | 5 failed / 3 passed | no Start visit / Today button; the 3 passing = "must not show" guards |
| `backend/tests/test_intake_token_current.py` | 9 failed / 1 passed | route 404; "creates nothing" trivially passes |
| `SystemHealthPage.test.tsx` + `RegistrationQrPage.test.tsx` (vs old pages) | 8 failed / 1 passed | old wording/structure; QR not shown on open; public-link test already passed |
| `backend/tests/test_archived_not_in_daily_work.py` | 5 failed | archived patient counted/listed (`assert 2 == 1` ×4); no `patient_not_in_use_reason` |
| `StartVisitAppointments.test.tsx` (+2, vs old code) | 2 failed / 5 passed | old pages showed Start visit for removed patients; no note |

### New backend tests by file
| File | Count | Covers |
|---|---|---|
| `tests/test_start_visit.py` | 4 | BHW today list (order early/done/late, patient ref, completed included, cancelled/other days/inactive excluded); cap 10 of 12 with count 12; date filter one day (7:30 AM in, next-morning 7:30 out, day-before out); from-only / to-only bounds |
| `tests/test_intake_token_current.py` | 10 | none → null; shows just-created (same token/url/expiry); newest usable wins; reading creates nothing; skips used / drafted / expired / <1 h left / appointment-linked / patient-linked / other user's; 4 roles 200; anonymous 401 |
| `tests/test_archived_not_in_daily_work.py` | 5 | today list leaves out inactive + archived (bhw, physician); BHW doses due / missed / without-card leave out archived; Admin `active_patients` == `/patients` total; list + detail `patient_not_in_use_reason` (None / inactive msg / archived msg) |

### New frontend tests by file
| File | Count | Covers |
|---|---|---|
| `tests/lib/start-visit.test.ts` | 5 + 2 | `manilaDate` (23:30Z → next Manila day); roles; statuses; Manila "today" incl. 7:00 AM; href; removed patients no button; `startVisitBlockedReason` only where the button would show |
| `tests/components/StartVisitAppointments.test.tsx` | 5 + 2 | list: today open rows get link (incl. missed, 7:00 AM), completed/tomorrow don't; admin_staff none; Today button sets params + aria-pressed; detail: physician link + note; negatives (other day, completed, admin_staff, admin) after real render; archived/inactive chip with title; detail "No new visits for this patient" |
| `tests/components/StartVisitDashboard.test.tsx` | 3 | Physician + BHW (`describe.each`): Start visit on confirmed/missed, none on completed, row link to `/appointments/a2`; older BHW backend → no panel |
| `tests/components/SystemHealthPage.test.tsx` | 3 | all OK: hero "Everything is working", "10 of 10 working", 3 group headings, Redis card plain name + tech label, disk meter 37; error: "Something is not working", "8 of 10 working", Needs-attention rows worst first (Backups "Not working" then Admin SMS alerts "Needs a look"), Details href `#check-backup`, "No copy yet"; older backend without `reliability` → "7 of 7 working" |
| `tests/components/RegistrationQrPage.test.tsx` | 6 | reuses current link (no POST); creates when none; New link POSTs and replaces; 404 fallback creates; 429 error + Try again, nothing created; public link shown |

### Date-filter proof (#71)
```
docker exec shh-test-pg psql -U shh_test -d smarthealthhub_test -tAc "SHOW timezone"
UTC
7:30 AM Manila on 2030-03-04 = 2030-03-03 23:30 UTC → func.date() = 2030-03-03 (wrong day)
```

### Counts in the System Health hero
Total checks = 10 with `reliability` (backup, disk, media, database, redis, workers, sms, reminders, sign_in, alerts); 7 without (older backend: backup, disk, media, database, redis, workers, alerts). "Version" is a footer, not a check.

### Production probes at handoff time
| Check | Result |
|---|---|
| `/health` | ok |
| OpenAPI `AppointmentResponse.patient_not_in_use_reason` | True (#73 deployed) |
| OpenAPI `/api/v1/patients/intake-token/current` | True; anonymous GET 401 (#72) |
| OpenAPI `BhwDashboard.appointments_today` | True (#71) |
| Vercel page fetch `/settings/system-health` anonymous | 307 → `/login?next=…` (can't read chunks) |

## Code Analysis

- `appointment_service._manila_day(column)` = `func.date(func.timezone("Asia/Manila", column))`, defined **below** `list_appointments` in the module (fine at call time). `list_appointments(..., from_date, to_date, ...)` now uses it for both bounds.
- `dashboard_service`: `LIST_LIMIT = 10`, `IMMUNIZATION_LIST_LIMIT = 15`, `OPEN_DAY_STATUSES = ("pending","confirmed","completed","missed")`, `UPCOMING_STATUSES = ("pending","confirmed")`; `_appointments_on(db, start, end, limit) -> (total, rows)` filters `OPEN_DAY_STATUSES` + `_active_patient()`; `_Clock` gives Manila `today`, `day_start`, `day_end`. `_active_patient()` now `and_(Patient.is_active.is_(True), Patient.archived_at.is_(None))`, used ~11 places (physician waiting, follow-ups, doses, missed, without-card, admin active count, admin_staff intake counts).
- `schemas/dashboard.BhwDashboard.appointments_today: list[AppointmentRow] = Field(...)` (required in schema; frontend type optional).
- `schemas/appointment.AppointmentResponse.patient_not_in_use_reason: str | None = None`; set in `appointment_service._appointment_to_response(appt, patient)` (used by list, get, create, update).
- `intake_service.current_walk_in_token(db, created_by_id) -> PatientIntakeToken | None`; `_CURRENT_LINK_MIN_REMAINING = timedelta(hours=1)`; `_INTAKE_TOKEN_EXPIRY_HOURS = 48`. Endpoint `patients.py` `current_intake_token` builds `intake_url = f"{settings.QR_BASE_URL}/intake/{token}"`; POST is rate-limited 20/min per user (`limiter.check_rate_limit(key=f"intake_token:{user.id}")`), GET is not.
- Response JSON keys from these schemas are **snake_case** (`intake_url`, `expires_at`, `patient_not_in_use_reason`); frontend hooks map to camelCase where they have mappers (`hooks/useAppointments.mapAppointment`).
- Frontend `lib/start-visit.ts`: `canStartVisit(role, appt, today)` = `canLogVisit(role) && !appt.patientNotInUseReason && OPEN_STATUSES.includes(status) && manilaDate(scheduledAt) === today`; `startVisitBlockedReason` returns the reason only if the button would otherwise show.
- System Health page: `buildGroups(data) -> Group[]` (3 groups); `Item {key, name, purpose, tech, icon, check, value, facts?, meter?}`; cards have `id="check-{key}"` (`scroll-mt-24`) for the Details links; `NeedsAttention` sorts `error, unknown, warning`. Refresh still every 60 s (`REFRESH_MS`).
- Registration QR page: `load()` → `/system/registration-url` (errors swallowed to `null`) → `/patients/intake-token/current` (404/405 → fallback) → POST if null → `show(token, base)` builds URL from `qr_base_url` (trailing slash trimmed), else `token.intake_url`; `started` ref; `printPoster(...)` unchanged except `formatExpiry` (Manila tz); still hard-codes "Patubig, Marilao, Bulacan" on the poster.
- `reminder_scheduler._mark_missed_appointments_async` (Celery beat 18:00 Manila): step 2 selects `status == "missed"` AND `func.date(Appointment.scheduled_at) == datetime.now(tz=UTC).date()` → UTC date of the appointment (see Risks).

## Files Changed

### Backend source
- `backend/app/services/appointment_service.py` (#71 date filter via `_manila_day`, docstring; #73 `patient_not_in_use_reason` in `_appointment_to_response`).
- `backend/app/api/v1/endpoints/appointments.py` (#71 `from_date`/`to_date` Query descriptions "Manila day").
- `backend/app/services/dashboard_service.py` (#71 BHW `appointments_today`, module docstring; #73 `_active_patient`).
- `backend/app/schemas/dashboard.py` (#71 `BhwDashboard.appointments_today`).
- `backend/app/services/intake_service.py` (#72 `current_walk_in_token`, `_CURRENT_LINK_MIN_REMAINING`; LF file).
- `backend/app/api/v1/endpoints/patients.py` (#72 `GET /intake-token/current`).
- `backend/app/schemas/appointment.py` (#73 field).

### Backend tests (new)
- `backend/tests/test_start_visit.py` (4), `backend/tests/test_intake_token_current.py` (10), `backend/tests/test_archived_not_in_daily_work.py` (5).

### Frontend source
- `frontend/web/lib/start-visit.ts` (new #71; #73 `patientNotInUseReason`, `startVisitBlockedReason`).
- `frontend/web/components/dashboard/TodayAppointments.tsx` (new #71).
- `frontend/web/components/dashboard/PhysicianDashboard.tsx`, `BhwDashboard.tsx` (#71).
- `frontend/web/types/dashboard.ts` (#71 `BhwDashboardData.appointments_today?`).
- `frontend/web/app/(dashboard)/appointments/page.tsx` (#71 Today + Start visit; #73 chip).
- `frontend/web/app/(dashboard)/appointments/[appointmentId]/page.tsx` (#71 Start visit; #73 note).
- `frontend/web/app/(dashboard)/settings/system-health/page.tsx` (#72 rewrite).
- `frontend/web/app/(dashboard)/settings/registration-qr/page.tsx` (#72 rewrite).
- `frontend/web/app/globals.css` (#72 `.health-trace`).
- `frontend/web/hooks/useAppointments.ts`, `frontend/web/types/appointment.ts` (#73 field + mapping).

### Frontend tests (new / changed)
- New: `tests/lib/start-visit.test.ts`, `tests/components/StartVisitAppointments.test.tsx`, `tests/components/StartVisitDashboard.test.tsx`, `tests/components/SystemHealthPage.test.tsx`, `tests/components/RegistrationQrPage.test.tsx`. (#73 added cases to the first two.)

### Scratchpad (session-only, will be lost: `C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\358c7e1c-a38c-44d7-a46a-b8ef1374e11e\scratchpad\`)
`commit-start-visit-{backend,frontend}.txt`, `pr-body-start-visit.md`, `commit-qr-{backend,frontend}.txt`, `pr-body-health-qr.md`, `commit-archived-{backend,frontend}.txt`, `pr-body-archived.md`, `mine/`, `mine2/`, `mine3/` (copies used for red proofs), `commit-handoff-seq16.txt` (close step).

## User Feedback & Preferences (REQUIRED)

- "merged #70, go ahead with Start visit" → accepted the recommended next PR, including bundling the date-filter fix I proposed in onboarding (no objection).
- "merged and deployed, check it first, and can you please make the system health design more easier to understand, and make sure to use the fit icons for theme, and easier to read and good ui/ux design" → wants **plain-language, icon-led, theme-consistent** admin pages; cares about UI polish now, not only function.
- "on the …/settings/registration-qr please make the qr-code and its Pre-Visit Form Link displayed already but can be regenerate and ensure to improvise the ui/ux design of that page" → **no empty states that need a click** for the common case; keep a regenerate action.
- "all checked and working, go with 1" → picks from a numbered list; trusts the recommended order; short confirmations.
- "merged and deployed, check it first" (3×) → always verify CI, Vercel, OpenAPI and merged-vs-built stats before anything else, and report it first.
- "i want you to /handoff because 12AM the VM will close, so i can continue this session on a fresh session tomorrow, close this session" → the Azure VM shuts down at midnight (parent said auto-shutdown 02:00; **user now says 12 AM**); prefers fresh sessions via handoff + paste prompt.
- Selects whole PR bodies in the IDE (seen every time: `ide_selection` of the scratchpad PR body) → PR bodies must stand alone and be paste-ready.
- (Carried) user commits/pushes/merges/deploys; `git commit -F <file>`; pnpm not npm; never open `.env`; say "on the server (prompt `azureuser@smarthealth-server`)"; repo public, no PHI; **name the account/role for every browser check**; after-merge steps must actually work (same-day bookings need a time later today within clinic hours).

## Where We're Going

1. **START HERE: merge this handoff** (branch `docs/handoff-seq16`, docs only, no deploy). Then `git switch main; git pull` (CI on `544599a` already confirmed green at 23:47).
2. **Ask the user for the #73 browser check** (Admin archives a test patient that has an appointment today → BHW/Physician dashboard no longer lists it; Appointments → Today shows "Patient archived"; appointment page shows "No new visits for this patient"; restore afterwards). Also expect Admin "Active patients" to drop by the number of archived patients.
3. **Recommended next PR: missed-appointment SMS uses the UTC date** (`reminder_scheduler.py:420`). Write a `TZ=UTC0` test first: appointment at 7:30 AM Manila today, status `missed`, run `_mark_missed_appointments_async` step 2 at 18:00 Manila → expect a follow-up SMS enqueued. Fix with Manila day (`func.date(func.timezone("Asia/Manila", Appointment.scheduled_at)) == <Manila today>`). Also grep the workers for other `func.date(` / `datetime.now(tz=UTC).date()` day comparisons. Only after confirming red.
4. **Then let the user pick** (previous list, minus done): (a) removed-patient SMS gaps — manual "Send SMS" (`backend/app/api/v1/endpoints/sms.py` ~199) still allows archived patients; STOP opt-out lookup (~622) only matches active patients; (b) Archive page "Archived by" shows a UUID (`frontend/web/app/(dashboard)/patients/archived/page.tsx:286`) → name via `patient_service.user_names`; (c) clinic **days** (weekends/holidays); (d) docs: `DEV-WORKFLOW.md` §4 `pnpm dev`, §7 next migration `0033`, mention `TZ=UTC0` in §5.
5. **Defense items (user-only, remind once)**: manuscript wording (add: Start visit from today's appointments; plain-language System Health; QR ready on open; archived patients out of daily lists); load the gateway SIM + test SMS; final NTAG215 for the demo patient; reprint pre-#50 cards.
6. **Optional, only if asked**: appointments list/detail times in explicit Manila tz (`formatDateTime` uses browser tz); QR page could notice when the shown link gets used (no polling now; staff press New link); reschedule UI; walk-in intake → prefill; physician missing from the Registration QR nav item (`lib/navigation.ts:80` roles admin, bhw, admin_staff; backend allows physician); unify status words between Admin dashboard tile ("Healthy…") and System Health page ("Working…"); poster's hard-coded "Patubig, Marilao, Bulacan".

## Risks & Blockers

- **Probable bug, not yet tested: missed-appointment follow-up SMS skips 7:00-7:59 AM bookings.** `reminder_scheduler.py:407-421`: `today = datetime.now(tz=UTC).date()`, filter `func.date(Appointment.scheduled_at) == today`. The job runs at 18:00 Manila = 10:00 UTC (UTC date = Manila date then), but `func.date(timestamptz)` uses the DB session timezone (UTC), so a 7:30 AM Manila booking (23:30 UTC the day before) has the previous UTC date → not selected → that patient's "missed" SMS is never queued. The status update (step 1) is separate; check it too.
- **Admin "Active patients" number changes after #73** (drops by archived count). Expected; the user was told in the PR body. Analytics pages were NOT changed (they may still count archived patients differently).
- **Registration QR links are per staff account**: Admin and BHW see different QR codes; a printed poster shows a one-time link (as before).
- **Time-of-day tests**: `test_evening_booking_today_shows_up_in_add_visit` skips after 23:00 Manila (seen twice tonight); always run with `TZ=UTC0`.
- (Carried) Docker Desktop flaky; Azure VM shuts down at night (user: 12 AM); gateway SIM has no load; CI logs unreadable by Claude; Ctrl+Shift+R after Vercel deploys.

## Open Questions

1. Is the missed-SMS UTC-date issue real in production? (Needs the red test; could also check production `sms_logs` for missed follow-ups of early-morning bookings — read-only, no names.)
2. Which follow-up next (SMS gaps, Archive name, clinic days, docs)?
3. (Carried) Weekends/holidays closed? Are 7:00 AM–5:00 PM the real hours?
4. (Carried) `AGENTS.md` for Codex sessions?

## Tooling Gotchas (cost time this session)

- **Red proofs for pages**: copy my files to scratch, `git show HEAD:frontend/web/<path> > <path>` for each, run vitest, copy back, then `git diff --stat` to confirm restoration. Keep new lib files in place when the old pages don't import them; restore lib/hook/type files too when the old page imports them (#73 needed 5 files).
- **Suspended pages in tests**: pages using `use(params)` need `await act(async () => { render(...) })` and a positive assertion (e.g. the `h1`) before negative `queryBy…` checks, or the test can pass while the page is still suspended.
- **Next.js page files**: only the default export (and Next's known fields) may be exported from `page.tsx`.
- **lucide-react**: check an icon exists with `node -e "const l=require('lucide-react'); console.log(typeof l.Name)"` from `frontend/web` (no `Facebook`).
- **jsdom has no canvas**: mock `qrcode` (`toDataURL`, `toString`) and `sweetalert2` in page tests.
- **API JSON is snake_case** for these schemas (`intake_url`), even though some frontend types are camelCase via mappers.
- **CRLF files** (most backend `app/` files, some frontend): use the Edit tool, then `file <path>`; `intake_service.py` and new files are LF; git warns "LF will be replaced by CRLF" (harmless, autocrlf).
- **Background full suite**: start it with `run_in_background`, keep working on frontend, read only the `passed/failed` line when notified.
- **Vercel pages need sign-in** (307 → /login), so deploy content can't be verified anonymously; use Vercel status + user check.
- (Carried) never `git commit` with `GIT_INDEX_FILE` set; stats via scratch index `cp .git/index $S/ix; GIT_INDEX_FILE=$S/ix git add -- …; GIT_INDEX_FILE=$S/ix git diff --cached --shortstat; rm $S/ix`; branch after merge: `git switch -c <new> origin/main --no-track && git branch -f main origin/main`.

### Commands that worked
```bash
# CI + Vercel for main (PC, Bash tool)
SHA=$(git rev-parse origin/main)
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/$SHA/check-runs" | python -c "import sys,json; [print(r['name'],'|',r['status'],r['conclusion']) for r in json.load(sys.stdin)['check_runs']]"
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/$SHA/status" | python -c "import sys,json; d=json.load(sys.stdin); print(d['state'], [(s['context'],s['state']) for s in d['statuses']])"
# Is a field / route live?
curl -s https://smarthealth-hub.japaneast.cloudapp.azure.com/openapi.json | python -c "import sys,json; d=json.load(sys.stdin); print('patient_not_in_use_reason' in d['components']['schemas']['AppointmentResponse']['properties'])"
# Test DB + full suite as the server (Bash, backend/)
docker run -d --rm --name shh-test-pg -e POSTGRES_USER=shh_test -e POSTGRES_PASSWORD=shh_test -e POSTGRES_DB=smarthealthhub_test -p 127.0.0.1:5499:5432 postgres:18-alpine
docker run -d --rm --name shh-test-redis -p 127.0.0.1:6399:6379 redis:7-alpine
TZ=UTC0 DATABASE_URL="postgresql+asyncpg://shh_test:shh_test@127.0.0.1:5499/smarthealthhub_test" REDIS_URL="redis://127.0.0.1:6399/0" python -m pytest -p no:warnings -o addopts="" -q
python -m ruff check app tests/<file>; python -m ruff format --check app tests/<file>; python -m mypy app
docker stop shh-test-pg shh-test-redis
# Frontend (frontend/web)
pnpm exec tsc --noEmit; pnpm run lint; pnpm run test; pnpm run build; git checkout -- next-env.d.ts
# Server (prompt azureuser@smarthealth-server, from /opt/smarthealth-hub)
bash scripts/deploy.sh
```

## Timeline (user prompt → outcome)

| # | User said | Outcome |
|---|---|---|
| 1 | Paste prompt (seq 15) | Onboarding narrated; #70 open; date-filter bug found; waited |
| 2 | "merged #70, go ahead with Start visit" | Built #71 (705 / 262) |
| 3 | "merged and deployed, check it first, and … system health … registration-qr …" | Verified #71; built #72 (714+1 / 271) |
| 4 | "merged and deployed, check it first" | Verified #72; browser checks + next list (5 options) |
| 5 | "all checked and working, go with 1" | Built #73 (719+1 / 275) |
| 6 | "merged and deployed, check it first, and … /handoff … 12AM the VM will close … close this session" | Verified #73 deploy (CI partly running); found missed-SMS UTC date; this file |

## Quick Start for Next Session

```bash
# Reference docs
cat plans/handoffs/HANDOFF_start-visit-health-qr-live_2026-11-22.md
cat CLAUDE.md
cat DEV-WORKFLOW.md   # §4 says npm (use pnpm), §7 migration number stale (next 0033)

# Key files (explore adjacent code too)
backend/app/workers/reminder_scheduler.py          # _mark_missed_appointments_async (~367-440): UTC func.date at ~420
backend/app/workers/celery_app.py                   # beat schedule, Manila nowfun
backend/app/services/appointment_service.py        # _manila_day, list_appointments, _appointment_to_response
backend/app/services/dashboard_service.py          # _active_patient, _appointments_on, build_bhw
frontend/web/lib/start-visit.ts
frontend/web/app/(dashboard)/settings/registration-qr/page.tsx

# Verify current state (PowerShell on PC)
git fetch --prune; git switch main; git pull; git log --oneline -3     # expect 544599a (+ handoff merge)
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health
# Backend: TZ=UTC0 full suite → expect 719 passed (+1 skipped only after 23:00 Manila); frontend: pnpm run test → 275

# Next action
# Confirm handoff PR merged + 544599a CI green, ask for the #73 browser check, then propose the missed-SMS UTC-date fix (red test first).
```

## Appendix A: API changes this session (as of `544599a`)

| Method + path | Roles | Change | Notes |
|---|---|---|---|
| `GET /api/v1/appointments` | admin, bhw, physician, admin_staff | `from_date`/`to_date` = Manila days; items gain `patient_not_in_use_reason` | was UTC date |
| `GET /api/v1/appointments/{id}` | same | gains `patient_not_in_use_reason` | |
| `POST/PUT /api/v1/appointments…` | admin, bhw, physician | responses gain the field | |
| `GET /api/v1/dashboard/me` (bhw) | bhw | gains `appointments_today: AppointmentRow[]` (≤10) | |
| `GET /api/v1/dashboard/me` (all) | all | lists/counts leave out archived patients | Admin `active_patients` == `/patients` total |
| `GET /api/v1/patients/intake-token/current` | bhw, physician, admin_staff, admin | **new** → `{token, intake_url, expires_at}` or `null` | read-only, no audit, not rate-limited |

## Appendix B: Exact UI strings added this session

| Where | Text |
|---|---|
| Start visit (dashboards, list, detail) | "Start visit"; aria "Start visit for {name}" |
| Appointment page note | "Opens Add Visit, filled in from this appointment. Saving the visit marks the appointment completed." |
| Appointments filter | "Today" (aria-pressed) |
| Removed patient (list chip) | "Patient archived" / "Patient inactive" (title = 409 text) |
| Removed patient (detail) | "No new visits for this patient" + 409 text |
| System Health header | "System Health" / "A plain check of everything the health center relies on." / "Checked {time} · updates every minute" / button "Check now" ("Checking…") |
| Hero titles | "Everything is working" / "Working, but something needs a look" / "Something is not working" / "We can't tell right now"; chips "{n} of {m} working", "{k} to look at" |
| Hero sentence (ok) | "Records are being backed up, reminders are going out and staff can sign in. Nothing for you to do." |
| Sections | "Needs your attention"; "Are patient records safe?"; "Is the system running?"; "Are messages and sign-ins going through?" (suffix "Yes" or "{n} to look at") |
| Status words | "Working" / "Needs a look" / "Not working" / "Can't tell" |
| Card names (tech) | Backups (pg_dump + media archive); Storage space (Server disk); Photos and card PDFs (Media folder); Patient database (PostgreSQL); Sign-in codes and job queue (Redis); Background jobs (Celery worker + scheduler); SMS delivery (Semaphore SMS gateway); Automatic reminders (Celery beat jobs); Staff sign-ins (Auth + OTP); Admin SMS alerts (ADMIN_ALERT_PHONE) |
| Footer | "Version running on the server: {commit} · {environment}" |
| QR page | title "Pre-Visit Form QR"; "Show this at the counter. Walk-in patients scan it to fill in the pre-visit form on their own phone while they wait."; "Scan with your phone camera"; "Ready · one patient · until {time}"; "Pre-Visit Form Link"; "Copy link"/"Copied"; "Open form"; "Next patient?" + "Each link is for one patient. Make a new one after a patient sends the form. A link you replace still works for whoever already has it."; "New link"/"Making…"; "Print or share": "Print poster", "PNG", "SVG"; "How it works" 4 steps; "Public sign-up link" + "One permanent link for Facebook posts or a laminated poster. Sign-ups from it appear in Registrations → Online Applications for the Admin to approve."; toast "New link ready" |

## Appendix C: Manuscript facts verified this session (add to seq 15 Appendix D)

| Item | Fact |
|---|---|
| Start visit | Physicians and BHWs open a prefilled Add Visit in one click from today's appointments (dashboards, Appointments page, appointment page); saving the visit completes the appointment (#71). |
| Date handling | Appointment date filters and "today" lists use the Manila calendar day although the database runs on UTC (#71). |
| System Health | Admin page answers "is everything working?" in plain language, groups 10 checks under three questions, lists problems first with the server's explanation (#72). |
| Pre-visit QR | The walk-in QR code and link are ready when the page opens; staff make a new one-time link per patient (#72). |
| Removed patients | Deactivated and archived patients are left out of every dashboard list and count and get no Start visit (#73). |
| Testing | Backend 719 tests (run in UTC like production), frontend 275 tests; CI runs pytest, mypy, ruff, ESLint, tsc, Next.js build and Docker build on every PR. |

## Appendix D: After-merge browser checks given to the user (per PR)

| PR | Account | Steps | User result |
|---|---|---|---|
| #71 | BHW | Dashboard → "Today's appointments" → Start visit → Add Visit shows "Filled in from today's … appointment at …" → Save → appointment Completed, button gone | "all checked and working" (same-day booking needed: book during clinic hours for later that day) |
| #71 | Physician | Same on the Dashboard and on the appointment page (Actions → Start visit) | checked |
| #71 | any staff | Appointments → Today lists today's (incl. 7:00 AM); Physician/BHW see Start visit, Admin Staff doesn't | checked |
| #72 | Admin | Settings → System Health: banner, three groups, Check now | "all checked and working" |
| #72 | Admin / BHW / Admin Staff | Registration QR: QR + link on open; reload → same link; New link → changes; scan → form opens | checked |
| #73 | Admin then BHW/Physician | Archive a test patient with an appointment today → gone from dashboard; Appointments → Today shows "Patient archived"; appointment page "No new visits for this patient"; Admin → Patient Archive → Restore | **pending** (handoff requested right after deploy) |

## Appendix E: Smaller observations (not acted on)

- IDE diagnostics on `appointments/page.tsx` and `[appointmentId]/page.tsx` report Tailwind `cssConflict` (`focus-visible:outline` + `focus-visible:outline-2`) and `suggestCanonicalClasses` (`min-h-[44px]` → `min-h-11`, `bg-gradient-to-b` → `bg-linear-to-b`). These patterns pre-date this session and appear throughout both files; ESLint does not flag them (lint stays 0 errors). New code copied the existing pattern for consistency.
- `appointments/page.tsx` filters by patient name only on the **current page** of results (client-side `patientSearch`), unchanged.
- Appointment detail page still has the manual "Mark Completed" button; Start visit + saving the visit completes it automatically (`complete_appointments_for_visit`), so staff may see both paths.
- Registration QR still renders the poster with a hard-coded address line ("Patubig, Marilao, Bulacan") while the BHC name comes from `/system/registration-url`.
- The Admin dashboard System health tile (`AdminDashboard.tsx` `STATUS`: Healthy / Needs attention / Problem / Unknown) and the System Health page (`STATUS_LOOK`: Working / Needs a look / Not working / Can't tell) use different words for the same statuses.

## Session Closed
**Closed at:** 2026-11-22 ~23:50 (Manila, UTC+8), after #73 was merged (`544599a`, CI all green at 23:47) and deployed (`patient_not_in_use_reason` live in production OpenAPI); the user asked to close because the Azure VM shuts down at 12 AM
**Commit:** the `session: start-visit-health-qr-live` commit on branch `docs/handoff-seq16` that includes this note (run by the user from the commands Claude provided; merge via PR, docs only, no server update needed)
**Session status:** Handed off to next session
