# Role-based dashboards live and redesigned (#51, #53); analytics dates, CSV export, web workers, QR scan loop and signed card QR fixed (#48–#50); VM shutdown now 02:00 (#52); next: export permissions + audit (approved, not built)

**Date:** 2026-11-21
**Status:** IN PROGRESS (6 PRs merged and deployed this session; the approved export-permission change is NOT built yet; optional dashboard PR 2 not started)
**Bead(s):** none (`bd` CLI not installed on this PC)
**Epic:** Deploy SmartHealth Hub to production and harden it (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `11`
**Parent:** `HANDOFF_signin-hardening-dashboard-next_2026-11-21.md`
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > `HANDOFF_nfc-backups-done_2026-11-19.md` > `HANDOFF_phase9-system-health-done_2026-11-19.md` > `HANDOFF_phase10-admin-model-b-done_2026-11-19.md` > `HANDOFF_allergies-media-banner-done_2026-11-20.md` > `HANDOFF_sidebar-and-admin-next_2026-11-20.md` > `HANDOFF_admin-security-settings-done_2026-11-20.md` > `HANDOFF_reliability-done-deploy-pending_2026-11-20.md` > `HANDOFF_signin-hardening-dashboard-next_2026-11-21.md` > this

> ⚠️ This repo is **PUBLIC**. This file deliberately contains no passwords, keys,
> email addresses, phone numbers, patient names/codes, staff names, TextBee IDs,
> NFC signatures or chip serials. The user's screenshots this session showed real
> demo patient names, a staff member's name and patient UUIDs: none are reproduced
> here and must never be. Names that appear in tests (e.g. "Waiting Child",
> "Online Applicant") are invented test fixtures.

---

## Stale References

Identifiers from the parent (seq 10) that changed on purpose this session:

- `qr_data_uri=None,  # intentionally omitted on GET metadata` (health_cards.py `get_health_card`): **gone**. Now `qr_data_uri=qr_data_uri` from the opt-in `?include_qr=true` (#50).
- Endpoint description "Does NOT return the QR image — the frontend regenerates the QR preview client-side": **gone/wrong**. The frontend must never build a card QR (it can't sign).
- `HealthCardPreview.tsx` hard-coded `https://smarthealthhub.local/verify?pid=…&v=…` + `generateQrDataUri` fallback: **removed** (#50).
- `useWebWorker.ts` `setApi(Comlink.wrap<T>(worker))`: **replaced** by `const proxy = Comlink.wrap<T>(worker); setApi(() => proxy);` (#49).
- verify page `video.addEventListener("play", onPlay)` scan start: **removed**; the effect starts the loop directly (#49).
- `frontend/web/app/(dashboard)/dashboard/page.tsx` (474-line generic dashboard): **moved** to `frontend/web/components/dashboard/GenericDashboard.tsx` (default export renamed `GenericDashboard`), shown only when `/dashboard/me` returns 404. `page.tsx` is now a small role switcher (#51).
- `usePendingRegistrationsCount`, `usePanelData`: still exist, but **only inside `GenericDashboard.tsx`** (fallback).
- Parent's "export is counts only, no names" claim: **wrong** (see Code Analysis): export rows include full names, codes, ages and the visits' `chief_complaint`.
- Parent's audit action name `PHI_VIEW`: the real action string is **`VIEW_PHI`**.
- `PatientDemographicsChart.tsx` header comment "backend /analytics/overview does not yet expose seniorCount / pwdCount / pregnantCount": **stale**; `analytics_service.get_dashboard_overview` returns `senior_count`, `pwd_count`, `pregnant_count` (lines ~202–222). Not changed this session; relevant to "Where We're Going" step 2.
- Parent's VM fact "auto-shutdown 23:00 Manila": now **02:00 Manila** (user changed it in the Azure portal this session).

## Since Last Handoff

- **Parent step 0 (2 dashboard decisions):** both answered with **"go, all defaults"**: (1) export: allow BHW + Physician + Admin, write an `EXPORT` audit row per export, drop `chief_complaint` from Admin's visits export, keep admin_staff out; (2) scope: keep list + Admin + Admin-staff (own front-desk layout), cut list dropped. **Decision 2 was built (#51, #53). Decision 1 was NOT built yet**: it is the first item in Where We're Going.
- **Parent step 1 (layout sketches):** sent as ASCII sketches for 4 roles, approved with "go, all defaults" (physician queue includes physician-logged visits; greeting with name).
- **Parent step 2 (build PR):** done as #51 (`GET /api/v1/dashboard/me`, no migration, 404 fallback). The silent-403 Pending Registrations bug is gone for role dashboards (they never call `/intake-applications` for non-admins).
- **New work driven by findings:** #48 (analytics date params ignored + CSV export always failing), #49 (web-worker hook stored a Promise; QR scan loop never started), #50 (card preview printed an unsigned dev-host QR). None were in the parent plan; all came from verifying the parent's open questions or the user's screenshots.
- **User requests mid-session:** a narrative "scenario if all of that built" (given), "how to deploy" (explained), VM shutdown to 2 AM (done by user + docs #52), "make the UI/UX more lively" (#53).
- **Parent open questions:** Q1 export roles → answered (defaults), not built. Q2 scope → answered, built. Q3 OTP email in a real inbox → **still no screenshot**. Q4 "server really on 4d2d587?" → superseded: the Admin dashboard screenshot showed **Version 7ef9537** after #51's deploy. Q5 Filipino SMS native review → still open.
- **Trajectory:** still on the hardening/defense path; dashboards are now the visible feature for the defense. The user is "staying up night developing the other needs" and wants fresh sessions via handoffs.

## Reference Documents

- `CLAUDE.md`: conventions (Admin model B, audit every write, Alembic-only schema changes, AES-256-GCM fields incl. `visits.diagnosis`/`treatment_notes`, module boundaries, PHI never on NFC/QR).
- `docs/SmartHealth_Hub_System_Development_Plan.md` (git-ignored, local): authoritative scope (SDP §6.7 analytics, §7.4.4 web workers with main-thread fallback).
- `DEV-WORKFLOW.md`: §5 local test DB via Docker, §6 `deploy.sh`, §9 server cheat sheet + scheduled jobs table (updated in #52), §10 backups.
- Parent: `plans/handoffs/HANDOFF_signin-hardening-dashboard-next_2026-11-21.md` (#43–#46 detail, dashboard spec review keep/cut table, role-guard table).
- `C:\Users\githu\Downloads\smarthealth-hub-dashboard-content.md` (user's AI-generated dashboard spec, outside repo; reviewed in seq 10).
- Claude memory: `deployment_setup.md` (now says 02:00 shutdown), `local_db_tests.md` (510 tests + SQLAlchemy 2.0/2.1 gap), **new** `web_workers_testing.md`, `pnpm_not_npm.md`, `feedback_no_secret_screens.md`, `project_scaffold.md`, `feedback_ci_logs.md`.

## The Goal

SmartHealth Hub (thesis: Barangay Health Center records with NFC/QR health cards, SMS reminders, OTP MFA) runs in production for the thesis defense: website `https://smarthealth-hub-two.vercel.app` (Vercel, auto-deploys on merge to `main`), API `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose, deployed by hand with `bash scripts/deploy.sh` **on the server**). This session made the dashboard role-based (Physician, BHW, Admin, Admin staff each get their own content, decided by the server, without breaking Admin model B or showing clinical text), gave it a livelier design the user approved ("i like it"), and fixed four production bugs found while verifying (analytics dates, CSV export, web workers/QR scanning, unsigned card QR). Remaining: the export-permission/audit change the user already approved, optional dashboard extras (demographics, return rate after SMS, Resend), a small proxy hardening, and defense readiness.

## Where We Are

### Production
- `origin/main` = **`a019cca`** (merge of #53). Local `main` = `a019cca`, the only local branch (all session branches deleted after merge).
- CI on `a019cca`: pytest ✅, mypy ✅, lint BE ✅, lint FE ✅, tsc ✅, FE build ✅, Docker build ✅; Vercel ✅.
- **Server backend = `7ef9537`** (merge of #51), shown on the Admin dashboard "Version" in the user's screenshot. #52 (docs) and #53 (frontend-only) need no server deploy, so the server is current.
- `GET /api/v1/dashboard/me` without a session → **401** both directly and through the Vercel proxy (proves the backend route is deployed; 404 would mean old backend).
- **Azure auto-shutdown = 02:00 Manila** (screenshot: Enabled On, Scheduled shutdown 2:00:00 AM, Time zone (UTC+08:00), notification No). Changed by the user in the portal; DEV-WORKFLOW.md + memory updated.
- The user confirmed in the browser: Illness Trends uses chosen dates ✅; CSV export works (after a hard reload) ✅; scanning the card QR with a phone opens the production verify page ✅ ("it works now"); all four dashboards render with real data ✅; the redesign ✅ ("i have seen changes, i like it").
- The successful phone scan after #50 used the server-signed QR built from `QR_BASE_URL`, so **`QR_BASE_URL` on the server points at the production website** (the parent's worry about a wrong server setting is resolved; no env change was needed).
- **NOT yet confirmed by the user:** the **in-app** QR camera tab (Health Cards → Verify → QR Code), which is the code path fixed in #49. The phone test above used the phone's own camera app, which never runs that code. Tests + the production build cover it, but no real-camera check yet.

### Role dashboards (#51 backend + frontend, #53 redesign)
- Backend `GET /api/v1/dashboard/me` (`backend/app/api/v1/endpoints/dashboard.py`, guard `require_role("physician","bhw","admin","admin_staff")`) → `dashboard_service.build_dashboard(db, user, now=None)` → role builder; response model `RoleDashboard` = Pydantic union discriminated by `role` (`backend/app/schemas/dashboard.py`).
- Physician: `waiting_count` + `waiting` (≤10, visits dated today Manila, `diagnosis IS NULL`, active patients, any recorder; vital signs + `recorded_by_name`), `consultations_today`, `consultations_week` (Monday start, diagnosis NOT NULL), `follow_ups_due_7d` (prenatal/follow_up appointments pending/confirmed in next 7 days + scheduled doses due today..+7), `appointments_today_count` + list (≤10, excludes cancelled), `top_conditions_month` (top 5 `medical_history.condition_name` by `created_at` ≥ Manila month start).
- BHW: `immunizations_due_7d` (scheduled, due today..+7), `immunizations_overdue` (due < today), `immunizations_due` list (≤15, due ≤ today+7, sorted by due date then sitio, with `sitio_purok`, `overdue`), `missed_appointments_7d` + list (≤10, status missed, last 7 days, with `mobile_number`), `sms_today_sent` (sent/delivered/replied) / `sms_today_failed`, `failed_sms` (≤5, last 7 days, `kind` appointment/immunization/other, `reason` = `error_detail[:120]`), `appointments_today_count`, `previsit_forms_waiting`, `visits_logged_by_me_week` (`recorded_by == me`), `patients_without_active_card`.
- Admin (model B): `system` = full `collect_system_status(db)` (same as System Health page), `online_applications_pending`, `previsit_forms_waiting`, `recent_applications` (≤5, applicant name from `form_data.first_name/last_name`), `staff` (active / inactive / active with no sign-in for 30+ days), `active_patients`, `security_alerts` (the three anomaly checks run live). **No visits, vitals or conditions** (tested).
- Admin staff: `appointments_today_count` + list (≤15) with `intake_completed`, `intake_done_today`, `previsit_forms_waiting`, `appointments_tomorrow_count`.
- Frontend: `frontend/web/app/(dashboard)/dashboard/page.tsx` uses `useRoleDashboard()` (`hooks/useRoleDashboard.ts`): `loading | ready | unavailable (404 → <GenericDashboard/>) | error (alert)`. Components in `frontend/web/components/dashboard/`: `shared.tsx`, `PhysicianDashboard.tsx`, `BhwDashboard.tsx`, `AdminDashboard.tsx`, `AdminStaffDashboard.tsx`, `GenericDashboard.tsx`. Types in `frontend/web/types/dashboard.ts` (snake_case wire types like `HealthCardData`).
- Redesign (#53): DM Serif Display headings (`font-display`), warm ink `#2a1414` / muted `#8a6a6a`, card borders `#eadbd3`, rose accent, tones teal/amber/red/sky/slate, lucide icons; greeting uses the account's **full name** via `useCurrentUser()` (fallback: payload `first_name`); `.dash-rise` / `.dash-pulse` keyframes in `frontend/web/app/globals.css` disabled under `prefers-reduced-motion`.
- Real-data observations from the user's screenshots (no names): all BHW due doses were under **"No sitio/purok recorded"** (demo patients lack `sitio_purok`); Admin showed "Needs attention" because the **SMS** check was amber; 61 active patients; 3 active staff; sign-ins 24 h: 11 successful, **12 wrong passwords**, 0 wrong OTP; appointment reminder run Nov 21 9:00 PM · 0 SMS; immunization reminders "not recorded yet"; physician queue had 1 test visit logged at 9:45 PM with no vital signs.

### Fixes (#48–#50)
- #48: `hooks/useAnalytics.ts` sends `from_date`/`to_date` (was `from`/`to`, silently ignored → always last 30 days) in `useIllnessTrends`, `useNoShowRate`, `useAnalyticsExport`; export hook always requests `format=json` (with `format=csv` the API returns text/csv, `apiFetch` returns `undefined` for non-JSON, `rows.length` threw → "Export failed. Please try again." every time with CSV). `format` removed from `ExportParams`.
- #49: `useWebWorker` stores the Comlink proxy via an updater function (React called the callable proxy as `updater(prev)` → sent an RPC → stored a Promise → `worker.toCsv is not a function`); verify-page QR frame loop starts directly when phase becomes "scanning" (the `play` event fires before `play()` resolves, so the old listener never ran); `scanFrame` returns when `streamRef.current` is null.
- #50: `GET /health-cards/{patient_id}?include_qr=true` returns the signed `qr_data_uri` (same as PDF; only for an **active** card); Print page requests it; `HealthCardPreview` never draws its own QR and shows "QR on PDF" when none.

### Tests
- Backend full suite locally: **510 passed** (494 at session start → 499 after #50 → 510 after #51), ~88–187 s on Docker Postgres 18 + Redis 7.
- Frontend vitest: **150 passed** (129 → 134 → 138 → 141 → 147 → 150).
- Test containers `shh-test-pg` / `shh-test-redis` stopped (`--rm` → removed). Docker Desktop was started by a script this session (server 28.5.1).

### Repo / local state
- Uncommitted on purpose (never commit without asking): `README.md` (user's ssh line ~134), `backend/celerybeat-schedule-shm`, `backend/celerybeat-schedule-wal`, `START.md`, `dump.rdb`, `start-tunnel.ps1`. `stash@{0}` still present. Don't drop.
- `frontend/web/next-env.d.ts` is rewritten by every `next build`/`next dev` (`./.next/dev/types/routes.d.ts` ↔ `./.next/types/routes.d.ts`); always `git checkout -- frontend/web/next-env.d.ts` after building.
- This handoff file is untracked; needs a docs branch + PR (Session Closed section).

## What We Tried (Chronological)

1. **Onboarding (read-only).** `bd` missing. `git fetch`: `origin/main` = `1c3808a` (#47, the seq-10 handoff, merged); CI all green; `/health` 200. Local `main` behind at `4d2d587`, working copy on `docs/handoff-seq10`. Read key files + adjacent: `analytics.py`, `analytics_service.export_report_data`, `permissions.ts`, `navigation.ts`, `visit.py`, `api/v1/router.py`, `useAnalytics.ts`. **Found:** export returns names/codes/ages/chief_complaint with no audit (parent assumed counts only); `list_patients` writes no audit row while `get_patient`, `list_archived_patients`, `patient_summary_pdf` write `VIEW_PHI`; three hooks send `from`/`to` instead of `from_date`/`to_date`.
2. **User: "list what would you recommend"** → 20-item recommendation list (date-filter fix first; export roles + EXPORT audit + drop chief_complaint for Admin; per-role content; `GET /dashboard/me`; 404 fallback; no audit on name lists like `/patients`; fix silent 403; no migration; later demographics/return-rate/Resend; user checks).
3. **User: "give me first a scenario if all of that built"** → a day-in-the-life narrative (front desk 8:00, BHW 8:30, physician 9:00 waiting queue, 10:00 reminders, admin 11:00, BHW export 3 PM audited, defense demo). Note: scenario mentioned "1 locked account" which later turned out not to exist in the data model.
4. **#48 date params (test-first).** New `tests/hooks/useAnalytics.test.ts` (5). Red: **4 failed / 1 passed** (no-dates case already worked). While reading the Reports page found the **CSV path always failed** (`format=csv` → text/csv → `apiFetch` returns `undefined`). Fix: `from_date`/`to_date` + always `format=json`; removed `format` from `ExportParams` and the page call. 134 passed, tsc 0, eslint 0 errors (6 pre-existing `set-state-in-effect` warnings on untouched lines). User asked "how to deploy" → explained Vercel auto-deploy, no `deploy.sh` needed for frontend-only.
5. **User verified #48** with screenshots: Illness Trends subtitle "5/21/2026 – 11/21/2026" (comes from the backend echo `raw.from_date`, proving the params arrive). **Reports still showed "Export failed".**
6. **Investigation (wrong first diagnosis).** Built locally (`next build`, Next 16.2.10 Turbopack) and found `static/media/csvExport.worker.*.ts` and `qrScanner.worker.*.ts` emitted as raw TypeScript. Told the user Turbopack doesn't bundle workers (bug 2) and asked whether the thesis mentions workers. **User: "the web worker is not on the thesis but the client said include it, and the qr scanning too."**
7. **Worker experiment.** WebSearch + web-fetch agent (dev.to "When Turbopack breaks your web worker builds", next.js#86099): inconclusive (only workaround found: `next build --webpack`). Temporary page `app/zzworkertest/` with 4 `new Worker(new URL(...))` variants (module/classic, same dir/shared dir): all emitted raw `.ts`. **But** the compiled page code was `t.r(65246)(Worker,{type:"module"})` → `e.b(..., "static/chunks/turbopack-worker-*.js", [chunks])`: Turbopack bundles workers properly and the `.ts` media files are unused copies. **Retracted bug 2.**
8. **Real worker bug proven.** `node --input-type=module` with Comlink: `typeof Comlink.wrap(ep)` = `function`; calling it like React's updater returns a `Promise` with `.toCsv` undefined. Also found the QR **play-event race** and a loop-after-stop leak. Tests: `tests/hooks/useWebWorker.test.ts` (2, real Comlink over `MessageChannel`, `vi.stubGlobal("Worker", class {})`), `tests/components/HealthCardVerifyPage.test.tsx` (2). Red: hook `expected true to be false` + unhandled `rawValue.apply is not a function` (the "worker" receiving React's updater call); verify page "spy never called". Guard test: failed with the guard removed, passed with it (first attempt used `.click()` outside `act`, fixed with `fireEvent.click`). Production build confirmed: CSV worker chunk contains `toCsv`; QR worker chunks contain `decodeFrame` + `expose` and jsQR. 138 passed → #49.
9. **User: still "Export failed"** + console `Uncaught (in promise) TypeError: r.apply is not a function at s (0g035v_rej7s7.js:1:1333)`. That error only comes from the **old** hook → stale bundle in the browser. Verified Vercel served the fixed page chunk `3y_-d9kz27_vw.js` containing `s(()=>t)`. Hard reload → **user: "the csv works"**.
10. **QR card scan → "smarthealthhub.local DNS address could not be found".** URL had `pid` + `v=1` and **no `sig`** → from the on-screen preview, not the PDF. Cause: `GET /health-cards/{id}` omitted `qr_data_uri`; `HealthCardPreview` drew a hard-coded unsigned dev-host QR. **#50 (test-first):** backend `TestCardPreviewQr` (5) red **3 failed / 3 passed** (default-no-QR, lost-card, URL-format already held); frontend `tests/components/HealthCardQr.test.tsx` (3) red **2 failed**. Backend 499 passed, frontend 141. **User: "it works now"**.
11. **Dashboard sketches.** Checked data model first: users have no lockout field (only `is_active`, `last_login_at`; sign-in limit is a 15-min Redis rate limit) → "locked accounts" replaced by "not signed in for 30+ days"; no check-in step but `appointments.intake_completed` exists → front desk "form ✓". ASCII sketches for 4 roles + 2 default choices. **User: "go, all defaults".**
12. **#51 build (test-first).** Backend `tests/test_dashboard.py` (11) red **11 failed** (404, route missing) → service/schemas/endpoint/router → 11 passed first try; full suite **510 passed in 88.03 s**. Frontend `RoleDashboard.test.tsx` (6) red **5 failed / 1 passed** (404 fallback already held because the page was the old one) → components → 6 passed; vitest 147; tsc/eslint clean; build OK. Mid-build catch: reliability windows are `last_24h`/`last_7d`, not `day`; fixed the TS type before rendering. Forgot to branch (was on `main`) → `git switch -c feat/role-dashboards`; `git mv` had staged the rename → `git reset` those paths so the backend commit wouldn't include it.
13. **CI mypy failed** on #51 (20 errors: `Argument 2 to "_count" has incompatible type "Select[int]"; expected "Select[tuple[int]]"`). Cause: local SQLAlchemy **2.0.36**, CI installs **2.1.9** (`pyproject` `sqlalchemy[asyncio]>=2.0.36`). Reproduced: `pip install --no-deps --target <scratchpad>/sa21 "sqlalchemy>=2.1"` + `MYPYPATH=<…>/sa21 python -m mypy app --ignore-missing-imports` (21 errors: the 20 + 1 artifact inside `sa21/sqlalchemy/util/langhelpers.py:466`). Fix `_count(db, stmt: sa.Select[Any])`. Clean under both versions. Other CI checks (incl. pytest on 2.1) were already green. Memory updated.
14. **User merged + deployed #51**; `/dashboard/me` → 401 (deployed). **User: auto-off the VM at 2 AM?** Checked `dispatch_appointment_reminders` window = now + `SMS_REMINDER_LEAD_HOURS` (default **24**) ± 30 min, no catch-up → runs at 23:00–01:00 find no patients (no night appointments). Gave portal steps; user changed it (screenshot). Updated `DEV-WORKFLOW.md` (2 AM; Beat runs missed jobs once after VM start, lost on deploy; immunization catch-up row) → #52.
15. **User screenshots of real dashboards + "make the ui/ux more good, containers, icons, lively, especially System adm (just a green dot)".** Loaded `frontend-design` skill; direction "warm clinical editorial" matching sign-in/Verify pages. Tests first (+3: full-name greeting, due-today/tomorrow labels, "SMS needs attention" + tile reason) → red 3 failed. Rewrote `shared.tsx` + 4 role components + `types/dashboard.ts` (`HealthCheck` with `message`, `redis`, `media`, `alerts`, `checked_at`) + globals.css keyframes. Test fixes: old admin fixture lacked new fields (crash), "Tomorrow: 7 appointments" split across elements (use link role name), `useCurrentUser` module-level cache leaked between tests (mocked `@/hooks/useAuth` with a per-test `currentUser`), duplicate "SMS needs attention" (header + card).
16. **Visual check with real screenshots.** Temporary `app/verify-dashboard-preview/page.tsx` (public because proxy allows `startsWith("/verify")`), `next dev -p 3123`, Playwright 1.62 script `shoot.cjs` (needed `executablePath` = installed `chromium_headless_shell-1243` and `NODE_PATH=frontend/web/node_modules`), 1440 px + 390 px. Fixed: "10:00 / AM" wrapping (w-20 + nowrap), misaligned timeline rail (removed), cramped Sign-ins tile (figure + chips), oversized System text (text-2xl), truncated panel titles on phones ("View all" → `sr-only sm:not-sr-only`). Tailwind v4 IDE hint: `bg-gradient-to-*` → `bg-linear-to-*`. Deleted preview + stale `.next` (tsc error `Cannot find module '../../../app/verify-dashboard-preview/page.js'`). `sed -i` had flipped `GenericDashboard.tsx` to LF → restored. vitest **150**, build OK → #53. **User: "i like it".**

## Key Decisions

- **Server decides dashboard content** (`GET /dashboard/me`, union discriminated by `role`), like `require_role`; the frontend only renders. Rejected: client-side role switching over existing endpoints (would need many calls and put rules in the browser).
- **404 → old generic dashboard; any other error → alert** (Vercel deploys before `deploy.sh`). Rejected: falling back on every error (would hide real outages).
- **No audit row for dashboard lists** (names/codes only), matching `GET /patients` (not audited); opening a patient goes through audited detail endpoints (`VIEW_PHI`). Encrypted columns are never selected (queue tests `diagnosis IS NULL` only).
- **Physician waiting queue = any visit today with no diagnosis** (incl. physician-logged), Manila date. Rejected: BHW-logged only.
- **Admin gets `collect_system_status()` verbatim** (one source of truth with System Health) and **live anomaly checks** (findings are not stored anywhere; the hourly task only logs + SMS).
- **Pre-visit drafts counted in Python with `bool(draft_data)`** via `intake_service.list_pending_intakes`, because a JSONB column assigned `None` can be stored as JSON `null`, not SQL `NULL`.
- **Card QR is always the server's signed one.** `include_qr` is opt-in (list views poll this endpoint; avoid PNG renders) and only for an `active` card (others would not verify). Preview shows "QR on PDF" instead of any self-made QR.
- **Keep web workers** (client requirement even though the thesis doesn't mention them); fix the hook rather than bypass the worker. Rejected: building CSV on the main thread (my first plan, before the user's answer).
- **Export always fetches JSON rows** (page builds CSV/JSON itself). Rejected: teaching `apiFetch` to return text.
- **`_count(stmt: sa.Select[Any])`** to type-check under SQLAlchemy 2.0 and 2.1. Rejected: pinning SQLAlchemy (would diverge from what CI/Docker install).
- **VM shutdown 02:00** accepted: appointment reminders can't text patients at night (exact 24 h window), backup 22:30 still before shutdown, ~3 more VM hours/day (~$4–5/month by the seq-1 estimate of ~$45/month 24/7).
- **BHW sees patients' mobile numbers** on missed appointments (tap-to-call) and failed-SMS reasons: BHWs already see mobile numbers on patient pages and SMS Logs (`_logs_role` = admin, bhw), and following up by phone is their job. Admin staff and Physician payloads carry no mobile numbers.
- **Greeting uses full name** from `/users/me` ("Dr. Rosa Cruz"), not the first word ("Dr.", "System"). Backend `first_name` kept as fallback (no backend change for #53).
- **Design direction "warm clinical editorial"** (DM Serif Display, rose accent, status tints, lucide), not a new aesthetic, so dashboards match sign-in/Verify pages; motion limited to one load stagger + live pulse, both off under reduced motion.

## Evidence & Data

### PR / commit log (this session, all merged to `main`)
| PR | Branch | Commits | Merge | Summary | Files | Deploy |
|---|---|---|---|---|---|---|
| #48 | fix/analytics-date-params | `73cf51a` | `f18bb86` | from_date/to_date; export always JSON | 4 | Vercel only |
| #49 | fix/web-worker-hook | `ec2594e` | `f78652c` | useWebWorker proxy; QR loop start + stop guard | 4 | Vercel only |
| #50 | fix/card-preview-signed-qr | `08d57e9` | `9c31904` | `?include_qr=true`; preview never self-draws QR | 7 | Vercel + deploy.sh |
| #51 | feat/role-dashboards | `d133cfc` backend, `7113a3a` frontend, `38bbe39` mypy fix | `7ef9537` | `GET /dashboard/me` + 4 role pages | 5 + 10 + 1 | Vercel + deploy.sh (server = 7ef9537) |
| #52 | docs/vm-shutdown-2am | `50df1e4` | `8aee473` | DEV-WORKFLOW: 02:00, Beat catch-up, immunization row | 1 | none |
| #53 | feat/dashboard-ui | `7cbcd6f` | `a019cca` | redesign: icons, tiles, full-name greeting | 8 | Vercel only |

### CI per merge commit
| Commit | pytest | mypy | lint BE | lint FE | tsc | FE build | Docker | Vercel |
|---|---|---|---|---|---|---|---|---|
| `1c3808a` (#47 docs) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `f18bb86` (#48) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `f78652c` (#49) | — | — | — | — | — | — | — | ✅ (deployed 2026-11-21T09:48:55Z) |
| `9c31904` (#50) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| branch `7113a3a` (#51 before fix) | ✅ (SQLAlchemy 2.1) | ❌ 20 errors | ✅ | ✅ | ✅ | ✅ | skipped | ✅ preview |
| `7ef9537` (#51) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | in progress at check | ✅ |
| `a019cca` (#53) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Test count history
| Point | Backend | Frontend (vitest) | New tests |
|---|---|---|---|
| Session start | 494 | 129 | — |
| #48 | — | 134 | +5 `tests/hooks/useAnalytics.test.ts` |
| #49 | — | 138 | +2 `tests/hooks/useWebWorker.test.ts`, +2 `tests/components/HealthCardVerifyPage.test.tsx` |
| #50 | 499 (187.40 s) | 141 | +5 backend `TestCardPreviewQr`, +3 `tests/components/HealthCardQr.test.tsx` |
| #51 | **510** (88.03 s) | 147 | +11 `backend/tests/test_dashboard.py`, +6 `tests/components/RoleDashboard.test.tsx` |
| #53 | — | **150** | +3 in `RoleDashboard.test.tsx` |

### Red → green runs
| Test file | Red result | Why red | Note |
|---|---|---|---|
| useAnalytics.test.ts | 4 failed / 1 passed | `from_date` null; `format` null | no-dates case already worked |
| useWebWorker.test.ts | 1 failed / 1 passed | `instanceof Promise` true; unhandled `rawValue.apply is not a function` | Worker-unavailable case already worked |
| HealthCardVerifyPage.test.tsx | 1 failed (start) | requestAnimationFrame never called | stop-loop test red only with guard removed |
| test_health_cards.py TestCardPreviewQr | 3 failed / 3 passed | `None == 'data:image/png…'` | default-no-QR, lost card, URL format held |
| HealthCardQr.test.tsx | 2 failed / 1 passed | preview called `generateQrDataUri`; Print page didn't ask `include_qr` | signed-QR render already held |
| test_dashboard.py | 11 failed | 404 route missing | new feature |
| RoleDashboard.test.tsx (#51) | 5 failed / 1 passed | components missing | 404 fallback held (page was old) |
| RoleDashboard.test.tsx (#53) | 3 failed / 6 passed | heading lacked full name; "Due today" missing; no "SMS needs attention" | |

### Production build evidence (Next 16.2.10 Turbopack, local)
```
reports page calls:  e.b(t,"static/chunks/turbopack-worker-2gqdcwp7k90ea.js",["static/chunks/0g035v_rej7s7.js", ...])
0g035v_rej7s7.js      contains toCsv                  (CSV worker)
1xbzim9uhix6u.js      decodeFrame=1 expose=1           (QR worker)
0q68wfebr72w-.js      jsQR markers                    (QR worker dependency)
static/media/*.worker.<hash>.ts   raw TS copies, never loaded
built hook after #49: let t=r.wrap(e);return s(()=>t),()=>{e.terminate(),...}
Vercel reports chunk 3y_-d9kz27_vw.js (after #49): contains s(()=>t)   ✅
```

### Comlink/React proof (node, comlink 4.4.2)
```
typeof Comlink proxy: function
React would store: [object Promise] | .toCsv = undefined
```

### SQLAlchemy typing gap
| Env | SQLAlchemy | `select(func.count())` type | mypy result (before fix) |
|---|---|---|---|
| PC | 2.0.36 | `Select[tuple[int]]` | clean |
| CI (`>=2.0.36`) | 2.1.9 | `Select[int]` | 20 errors in dashboard_service.py |
| After `Select[Any]` | both | — | clean (2.1 shows 1 artifact in sa21/sqlalchemy/util/langhelpers.py:466 only) |

### Deployed checks
| Check | Result |
|---|---|
| `/health` (all session) | `{"status":"ok","service":"smarthealth-hub-api","version":"0.1.0"}` |
| `/api/v1/dashboard/me` no auth (direct + via Vercel) | 401 / 401 |
| Website `/login` | 200 in 0.85 s |
| `/analytics/reports` without session | 307 → `/login?next=%2Fanalytics%2Freports` |

### Dashboard data sources (built in #51)
| Section | Query basis | Limits |
|---|---|---|
| Physician waiting | `visits` today (Manila) `diagnosis IS NULL`, active patients, outer join recorder `users.full_name` | list 10 |
| Physician consultations | `visits` with diagnosis, today / Monday..today | counts |
| Follow-ups due | appointments `prenatal`,`follow_up` in pending/confirmed next 7 days + `immunizations` scheduled due today..+7 | count |
| Top conditions | `medical_history.condition_name` since Manila month start | top 5 |
| BHW doses | `immunizations` scheduled, due ≤ today+7, active patients | list 15 |
| BHW missed | `appointments` missed in last 7 days | list 10 |
| BHW SMS | `sms_logs` created today: sent/delivered/replied vs failed; failed list last 7 days | list 5 |
| Pre-visit drafts | `intake_service.list_pending_intakes` + `bool(draft_data)` | count |
| Admin system | `collect_system_status(db)` | — |
| Admin alerts | `check_login_failure_burst`, `check_phi_view_burst`, `check_after_hours_deletes` | live |
| Staff | `users.is_active`, `last_login_at < now-30d or NULL` | counts |
| Front desk | appointments today (non-cancelled) + `intake_completed`, tomorrow count | list 15 |

### Reminder-at-night analysis (for the 02:00 shutdown)
```
dispatch-appointment-reminders: crontab(minute=0)   window = now + lead_hours ± 30 min (no catch-up)
SMS_REMINDER_LEAD_HOURS default 24 (admin setting sms_reminder_lead_hours)
→ runs at 23:00 / 00:00 / 01:00 target appointments 23:00–01:00 the next day → none at the BHC
monitoring.check_sms_failure_rate + audit.scan_anomalies: crontab(minute=30) → admin SMS only (ADMIN_ALERT_PHONE)
backup 22:30 (separate container) still before 02:00
```

### Screenshot evidence (user, 2026-11-21, values only)
| Screen | Values |
|---|---|
| Illness Trends | From 05/21/2026 To 11/21/2026, Monthly; subtitle "5/21/2026 – 11/21/2026 · grouped by month"; one point 2026-11; 8 conditions in legend |
| Reports (before hard reload) | "Export failed. Please try again.", Immunizations, dates empty |
| Phone QR scan | `smarthealthhub.local/verify?pid=…&v=1` → DNS_PROBE_POSSIBLE |
| Azure auto-shutdown | On · 2:00:00 AM · (UTC+08:00) · notification No |
| Admin dashboard (#51) | Needs attention · Version 7ef9537 · registrations 0 · 3 active staff · 61 patients · DB OK · backup up to date · SMS 3 sent 0 failed (amber) · disk 26% · sign-ins 11, wrong passwords 12, wrong OTP 0 · appointment reminders Nov 21 9:00 PM 0 SMS · immunization not recorded yet |
| Physician (#51) | waiting 1 · consultations 0 · 8 · follow-ups 14 · today's appointments 2 |
| BHW (#51) | 10 due doses, all under "No sitio/purok recorded", due Nov 21–28 |

### Playwright preview screenshots (made-up data; session scratchpad, will be lost)
`C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\9c4676d4-4c96-40b3-bd28-f52976c48ff5\scratchpad\dash-{physician,bhw,admin,admin_staff}-{desktop,mobile}.png`

## Code Analysis

- **Export (`analytics_service.export_report_data`, ~line 475)**: `patients` → id, patient_code, full_name, sex, age, is_active, created_at (filter `Patient.created_at`); `visits` → patient_code, full_name, visited_at, visit_type, **chief_complaint** (filter `Visit.visit_date`); `immunizations` → patient_code, full_name, vaccine_name, dose_number, administered_at, next_due_date, status (filter `Immunization.created_at`); `appointments` → patient_code, full_name, appointment_type, scheduled_at, status. Guard `_ADMIN_OR_BHW = require_role("admin","bhw")` (analytics.py:66). **No audit row.** Frontend caller: `app/(dashboard)/analytics/reports/page.tsx` via `useAnalyticsExport`.
- **Audit**: `audit_service.write_audit_log(...)`; `patients.py` writes `action="VIEW_PHI"` in `list_archived_patients` (~545), `get_patient` (~610), `patient_summary_pdf` (~750); `list_patients` writes none.
- **`apiFetch` (`frontend/web/lib/api-client.ts:102-168`)**: JSON headers; 401 → one refresh retry; non-2xx → `ApiError(message, status, code)` from `{error:{code,message}}`; **non-JSON 2xx → returns `undefined`** (line 163).
- **`useWebWorker` (`hooks/useWebWorker.ts`)**: factory pattern (keeps `new Worker(new URL(...))` literal at the call site for bundlers); returns `null` without `Worker` (callers fall back). Call sites: `analytics/reports/page.tsx:61` (csvExport), `health-cards/verify/page.tsx:197` (qrScanner). Other workers in `workers/` (`analyticsAggregator`, `patientSearch`, `qrGenerator`) have no `new Worker` call site.
- **QR verify page**: `startCamera` awaits `video.play()` then `setState({phase:"scanning"})`; scanning effect now `requestAnimationFrame(scanFrame)` with cleanup; `scanFrame` returns if `!streamRef.current`; decode via `qrWorker.decodeFrame` or `decodeFrameOnMainThread`; `parseQrPayload` then `POST /health-cards/verify?full=true`.
- **QR signing**: `qr_service.build_qr_url(pid, v)` = `{QR_BASE_URL}/verify?pid&v&sig` (HMAC); `encode_qr_payload` returns `(signed_url, data_uri)` and is deterministic (tests compare PNGs). `GET /health-cards/{patient_id}`: prefers active card, else latest any status; `allow_missing` envelope; `include_qr` only for active.
- **Proxy (`frontend/web/proxy.ts:31-38`)**: public if `pathname.startsWith("/verify")` (also matches `/verify-otp`, `/verify-anything`), `/login`, `/verify-otp`, `/forgot-password`, `/intake/`, `/api/`, `/_next/`. Over-broad prefix → any future `/verify…` page is public.
- **Dashboard service internals**: `_Clock(now)` → `today` (Manila), `day_start/day_end`, `week_start` (Monday), `month_start`; `_count(db, stmt: sa.Select[Any])`; `_appointments_on(db, start, end, limit)` returns (count, rows) with `OPEN_DAY_STATUSES = ("pending","confirmed","completed","missed")`; constants `LIST_LIMIT=10`, `IMMUNIZATION_LIST_LIMIT=15`, `FOLLOW_UP_DAYS=7`, `MISSED_LOOKBACK_DAYS=7`, `FAILED_SMS_LOOKBACK_DAYS=7`, `INACTIVE_STAFF_DAYS=30`, `FOLLOW_UP_TYPES=("prenatal","follow_up")`, `SMS_SENT_STATUSES=("sent","delivered","replied")`; `_BUILDERS` dict typed `Callable[[AsyncSession, User, _Clock], Awaitable[DashboardModel]]`; unknown role → `ForbiddenError`.
- **System status schema** (`schemas/system_config.py`): `SystemStatusResponse{overall, checked_at, version{commit,environment}, database, redis, workers, disk{used_percent…}, media, backup{last_success_at…}, alerts, reliability{sms{last_24h,last_7d}, sign_in{last_24h,last_7d}, reminders{runs[]}}}`; each check has `status` (ok/warning/error/unknown) + `message`. Reminders are information only (not in overall).
- **`useCurrentUser` (`hooks/useAuth.ts:59`)**: module-level cache `_cachedUser/_cacheValid` shared across components → in tests mock `@/hooks/useAuth` instead of relying on `/users/me` (the cache leaks between tests).
- **Existing demographics chart**: `components/charts/PatientDemographicsChart.tsx` (Recharts donut + progress sidebar) on `app/(dashboard)/analytics/page.tsx:245`, fed by `useDashboardOverview` (`seniorCount/pwdCount/pregnantCount`); header comment claims the backend lacks those counts (stale).
- **Tailwind v4** (`tailwindcss ^4`): canonical gradient class is `bg-linear-to-*`; theme tokens in `app/globals.css` `@theme` (teal `--color-primary #0d9488`, rose theme `#b5343e` under `[data-theme="rose"]`); fonts `DM_Sans` (`--font-dm-sans`), `DM_Serif_Display` (`--font-dm-serif`, `.font-display`).

### Dashboard design system (`frontend/web/components/dashboard/shared.tsx`, #53)
| Export | Purpose |
|---|---|
| `Tone` = `rose \| teal \| amber \| red \| sky \| slate`; `TONE[tone].{badge,chip,bar}` | Tailwind class sets per tone (badge bg/text/ring, chip, progress bar) |
| `rise(index)` → `{className:"dash-rise", style:{animationDelay}}` | staggered load animation (55 ms per step, capped at 12) |
| `formatTime`, `formatDay`, `formatLongDay`, `humanize` | Manila-time formatting; bare `YYYY-MM-DD` read as Manila noon |
| `dueLabel(dueDate, today)` → `{text, tone}` | "Overdue · Nov 18" (red) / "Due today" (amber) / "Tomorrow" (sky) / "In N days · date" (slate) |
| `IconBadge({icon, tone, size})`, `Chip({icon, tone})`, `Avatar({name})`, `StatusBadge({status})` | small pieces (lucide icons; avatar tint hashed from name) |
| `DashboardHeader({firstName, today, roleLabel, roleIcon, summary, actions})` | greeting container; full name from `useCurrentUser()`; first action filled rose |
| `StatCard({label, value, sub, icon, tone, href, emphasis, index})`, `StatGrid({columns})` | number cards; `emphasis` = rose gradient card |
| `Panel({title, icon, tone, count, href, linkLabel, index})`, `RowList`, `EmptyRow({icon, hint})`, `TwoColumns` | sections with icon header + count chip; `aria-label={title}` makes it a `region` for tests |
| `text = {ink, muted, card}` | shared class strings (`text-[#2a1414]`, `text-[#8a6a6a]`, card border/shadow) |
| Admin-only: `HealthTile` (`role="group" aria-label={name}`), `Meter` (`role="meter"`), `Figure` | system-health tiles in `AdminDashboard.tsx` |

### Frontend test patterns that worked this session
- **Route `apiFetch` by path:** `vi.mock("@/lib/api-client", async (orig) => ({...await orig(), apiFetch: vi.fn()}))`, then `apiFetchMock.mockImplementation(async (path) => path === "/dashboard/me" ? data : …)`.
- **Pages using `use(params)`:** `render(<Suspense fallback={null}><Page params={Promise.resolve({patientId:"p-1"})} /></Suspense>)` inside `await act(async () => …)`.
- **Web worker hook:** `vi.stubGlobal("Worker", class {})`, `const {port1, port2} = new MessageChannel(); Comlink.expose(api, port2)`, factory returns `Object.assign(port1, {terminate})`.
- **Browser event order for media:** `vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function(){ this.dispatchEvent(new Event("play")); return Promise.resolve(); })`; stub `requestAnimationFrame`.
- **Current user:** mock `@/hooks/useAuth` with a per-test `currentUser` variable (the real hook's module cache leaks across tests).
- **Clicks that change state with effects:** use `fireEvent.click` (wrapped in `act`), not `element.click()`.

## Timeline (user prompt → outcome)

| # | User said | Outcome |
|---|---|---|
| 1 | Paste prompt (seq 10) + "wait for my go-ahead" | Onboarding; #47 merged; export not counts-only; date-param bug found; 2 decisions asked |
| 2 | "list what would you recommend" | 20-item recommendation list (below) |
| 3 | "give me first a scenario if all of that built" | Day-in-the-life narrative for 4 roles + defense demo |
| 4 | "go all defaults, start with the item 1" | #48 date params + CSV export (134 passed) |
| 5 | "how to deploy" (README ssh line selected) | Vercel-only explanation; deploy.sh only for backend changes |
| 6 | "merged and deployed. check it" | CI/Vercel/health verified; asked for 2 browser checks |
| 7 | Screenshots: Illness Trends OK, Export failed | Wrong "unbuilt worker" diagnosis; asked about thesis/workers |
| 8 | "the web worker is not on the thesis but the client said include it, and the qr scanning too." | Worker experiment → retraction → real hook bug + QR loop bugs → #49 (138 passed) |
| 9 | "i have merged, i still encounter Export failed" + console `r.apply is not a function` | Stale bundle in the browser; Vercel chunk verified; hard reload |
| 10 | Phone screenshot: smarthealthhub.local DNS error | Unsigned preview QR found → #50 (499 / 141 passed) |
| 11 | "the csv works, go" | (#50 built in this turn) |
| 12 | "it works now, what's next?" | Merged #50; next-steps list; saved web-workers memory |
| 13 | "go" | ASCII sketches for 4 roles (lockout/check-in corrections) |
| 14 | "go, all defaults" | #51 backend + frontend (510 / 147 passed) |
| 15 | Pasted CI mypy log (20 errors) | SQLAlchemy 2.1 typing gap → `Select[Any]` fix commit |
| 16 | "can i first auto off the vm on 2AM…?" | Night-reminder safety analysis + portal steps |
| 17 | Azure screenshot + "I have merged it and deployed, and change the vm to 2AM, check it" | /dashboard/me 401; docs PR #52 prepared |
| 18 | 3 dashboard screenshots + "make the ui/ux more good… lively… System adm just a green dot" | #53 redesign with Playwright visual checks (150 passed) |
| 19 | "merged, what's next? i have seen changes, i like it." | Next-steps list (handoff recommended first) |
| 20 | "I want you now to /handoff so i can start this session on a fresh session" | This file |

## Approved recommendation list (user: "go, all defaults")

What the user approved after "list what would you recommend"; ✅ built, ❌ not built:
1. ✅ Date-filter fix first as its own small PR (#48, plus CSV export).
2. ✅ Layout sketches before code.
3. ✅ Dashboard PR test-first on local DB (#51).
4. ❌ `/analytics/export` for BHW + Physician + Admin.
5. ❌ One audit row per export (who, report, dates).
6. ❌ Drop `chief_complaint` from Admin's visits export (model B).
7. ❌ Keep admin_staff out of export (currently already out; must stay out after the guard change).
8. ✅ Physician dashboard (waiting queue, consultations, follow-ups, today's appointments, chart).
9. ✅ BHW dashboard (due by sitio, missed, SMS, drafts, own visits, quick actions).
10. ✅ Admin dashboard (system, registrations, users, nothing clinical).
11. ✅ Admin staff own front-desk layout.
12. ✅ Cut list respected (no availability toggle, medications, walk-in ratio, "pending" cards, embedded forms).
13. ✅ One endpoint `GET /dashboard/me`.
14. ✅ Old dashboard until backend deployed (404 fallback).
15. ✅ Lists names/codes only, no audit row (like `/patients`); never diagnosis/treatment text.
16. ✅ Silent 403 on pending registrations gone for role dashboards.
17. ✅ No migration.
18. ❌ Later: demographics chart, return rate after SMS reminders, Resend failed SMS.
19. ❌ Later: handoff cleanup items (listed in Where We're Going 7).
20. ⏳ User checks (OTP email, Version card → done via Admin dashboard 7ef9537, 10:00 immunization run).

## Tooling Gotchas (cost time this session)

- **Stale browser bundle after Vercel deploy** looks exactly like an unfixed bug; the console error names the old chunk. Ask for **Ctrl+Shift+R** first.
- **Turbopack emits raw `static/media/*.worker.<hash>.ts` copies**; they are NOT the loaded worker. Look for `e.b(…, "static/chunks/turbopack-worker-*.js", [chunks])` in the page chunk and grep those chunks for the worker's code.
- **Local vs Vercel chunk names**: some page chunk hashes match (e.g. `3y_-d9kz27_vw.js`, `0g035v_rej7s7.js`), others differ (local `1mqss3egm4_76.js` was 404 on Vercel). Probe by content, not by name.
- **`next build` / `next dev` rewrite `frontend/web/next-env.d.ts`** → always `git checkout -- frontend/web/next-env.d.ts` afterwards.
- **Deleted pages leave stale types** in `.next/types` / `.next/dev/types` → `tsc` error `Cannot find module '../../app/<page>/page.js'`; fix by deleting `frontend/web/.next`.
- **`sed -i` on Windows (Git bash) converts CRLF files to LF** → shows the file as modified; restore with `git checkout -- <file>` if unintended. Prefer Python `open(..., newline="")` or the Edit tool for CRLF files.
- **`git mv` stages the rename** → a later `git commit -F` would include it in whatever commit comes first; `git reset -q -- <paths>` to unstage before handing the user split commits.
- **Forgot to branch**: always `git switch -c <branch>` before editing; check `git branch --show-current` (once this session I built #51 on `main` and moved it afterwards; uncommitted changes move with `git switch -c`).
- **Playwright 1.62 wants a newer browser** than installed → `chromium.launch({ executablePath: "%LOCALAPPDATA%/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe" })`; script outside the project needs `NODE_PATH=<repo>/frontend/web/node_modules`.
- **Previewing an authenticated page without login**: the proxy treats any `/verify…` path as public, so a temporary `app/verify-dashboard-preview/page.tsx` renders without a session. Delete it afterwards (and fix the proxy, Where We're Going 3).
- **PowerShell tool cwd persists** between calls (`cd backend` failed once because it was already in `backend`); the Bash tool resets to the repo root outside the workspace. Use absolute paths.
- **Docker Desktop not running** → `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` and poll `docker info` (ready in ~10–30 s).
- **pytest `addopts = "--tb=short -q"`**: use `-o addopts=""` to see `N passed`; long runs can go in the background writing a summary file.
- **SQLAlchemy 2.1 vs 2.0 mypy**: see Risks; recipe in memory `local_db_tests.md`.
- **Tailwind v4**: `bg-gradient-to-*` → `bg-linear-to-*` (IDE `suggestCanonicalClasses` warning).
- **Python heredoc with `\.` inside `'''` strings** prints a SyntaxWarning but writes `\.` correctly; check the output file with grep.

### Commands that worked
```bash
# PC (Bash tool): CI + Vercel for a commit
SHA=$(git rev-parse origin/main)
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/$SHA/check-runs" | python -c "import sys,json; [print(r['name'],r['status'],r['conclusion']) for r in json.load(sys.stdin)['check_runs']]"
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/$SHA/status" | python -c "import sys,json; print(json.load(sys.stdin)['state'])"
# Deployed-route probe (401 = route exists, 404 = old backend)
curl -s -o /dev/null -w "%{http_code}\n" https://smarthealth-hub.japaneast.cloudapp.azure.com/api/v1/dashboard/me
# Inspect a built chunk for a worker / fix
grep -o 'if("u"<typeof Worker)return;[^}]*}' frontend/web/.next/static/chunks/*.js
# mypy against SQLAlchemy 2.1 (CI)
pip install -q --no-deps --target <scratchpad>/sa21 "sqlalchemy>=2.1"
MYPYPATH=<scratchpad>/sa21 python -m mypy app --ignore-missing-imports
# Visual check (dev server + Playwright)
pnpm exec next dev -p 3123            # background
CHROME_EXE=".../chrome-headless-shell.exe" NODE_PATH="$(pwd)/node_modules" node <scratchpad>/shoot.cjs <outdir>
# Stop the dev server (PowerShell)
Get-NetTCPConnection -LocalPort 3123 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }
# Server (user runs; prompt azureuser@smarthealth-server)
cd /opt/smarthealth-hub && git log --oneline -1 && bash scripts/deploy.sh
```

## Files Changed

### Source code
- `frontend/web/hooks/useAnalytics.ts` (#48): `from_date`/`to_date` in 3 hooks; export `format: "json"` always.
- `frontend/web/types/analytics.ts` (#48): `ExportParams` without `format`.
- `frontend/web/app/(dashboard)/analytics/reports/page.tsx` (#48): stops passing `format`.
- `frontend/web/hooks/useWebWorker.ts` (#49): `setApi(() => proxy)` + comment.
- `frontend/web/app/(dashboard)/health-cards/verify/page.tsx` (#49): loop start effect; `scanFrame` stream guard.
- `backend/app/api/v1/endpoints/health_cards.py` (#50): `include_qr` query param + description; QR only for active card.
- `frontend/web/app/(dashboard)/health-cards/[patientId]/print/page.tsx` (#50): `?include_qr=true`.
- `frontend/web/components/cards/HealthCardPreview.tsx` (#50): no self-built QR; "QR on PDF" placeholder; removed `useEffect`/`generateQrDataUri`.
- `frontend/web/lib/qr.ts`, `frontend/web/workers/qrGenerator.worker.ts` (#50): comment examples use `{QR_BASE_URL}`.
- `backend/app/schemas/dashboard.py` (#51, new): PatientRef, AppointmentRow, WaitingVisit, ConditionCount, ImmunizationDueRow, MissedAppointmentRow, FailedSmsRow, ApplicationRow, StaffAccounts, SecurityAlert, 4 role models, `RoleDashboard`.
- `backend/app/services/dashboard_service.py` (#51, new; #51 fix `Select[Any]`).
- `backend/app/api/v1/endpoints/dashboard.py` (#51, new) + `backend/app/api/v1/router.py` (include `dashboard.router`).
- `frontend/web/types/dashboard.ts` (#51 new; #53 `HealthCheck`, full `SystemSummary`).
- `frontend/web/hooks/useRoleDashboard.ts` (#51, new).
- `frontend/web/app/(dashboard)/dashboard/page.tsx` (#51): role switcher.
- `frontend/web/components/dashboard/GenericDashboard.tsx` (#51, moved from the old page).
- `frontend/web/components/dashboard/{shared,PhysicianDashboard,BhwDashboard,AdminDashboard,AdminStaffDashboard}.tsx` (#51 new; #53 redesigned).
- `frontend/web/app/globals.css` (#53): `.dash-rise`, `.dash-pulse`, reduced-motion block.

### Tests
- `frontend/web/tests/hooks/useAnalytics.test.ts` (#48, 5).
- `frontend/web/tests/hooks/useWebWorker.test.ts` (#49, 2).
- `frontend/web/tests/components/HealthCardVerifyPage.test.tsx` (#49, 2).
- `backend/tests/test_health_cards.py` (#50, class `TestCardPreviewQr`, 5).
- `frontend/web/tests/components/HealthCardQr.test.tsx` (#50, 3).
- `backend/tests/test_dashboard.py` (#51, 11; helpers `_signed_in`, `_patient`, `_visit`, `_appointment`, `_dose`, `_sms`, `_draft`, `_application`, `_no_clinical_text`).
- `frontend/web/tests/components/RoleDashboard.test.tsx` (#51 6, #53 +3; mocks `@/hooks/useAuth`).

### Docs
- `DEV-WORKFLOW.md` (#52): §9 auto-shutdown 2:00 AM, Beat catch-up wording, immunization row; §10 "before the 02:00 auto-shutdown".
- This handoff.

### Claude memory
- `web_workers_testing.md` (new) + `MEMORY.md` index line.
- `local_db_tests.md`: 510 count; SQLAlchemy 2.0 vs 2.1 mypy recipe.
- `deployment_setup.md`: auto-shutdown 02:00 since 2026-11-21 + why night reminders are safe.

### Scratchpad (session-only: `C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\9c4676d4-4c96-40b3-bd28-f52976c48ff5\scratchpad\`)
`commit-analytics-date-params.txt`, `pr-body-analytics-date-params.md`, `commit-web-worker-hook.txt`, `pr-body-web-worker-hook.md`, `commit-card-preview-signed-qr.txt`, `pr-body-card-preview-signed-qr.md`, `commit-dashboard-backend.txt`, `commit-dashboard-frontend.txt`, `pr-body-role-dashboards.md`, `commit-dashboard-mypy.txt`, `commit-docs-vm-2am.txt`, `commit-dashboard-ui.txt`, `pr-body-dashboard-ui.md`, `pytest-dashboard.txt` (510 passed), `next-dev.log`, `shoot.cjs` (Playwright screenshot script), `sa21/` (SQLAlchemy 2.1.9 for mypy), `dash-*-desktop.png` / `dash-*-mobile.png` (8 previews), `commit-handoff-seq11.txt` (for this handoff).

## User Feedback & Preferences (REQUIRED)

- **"go, all defaults"** (3× this session) and **"go"**: accept my single recommendation and build; don't re-ask.
- **"list what would you recommend"**: wants a concrete numbered list of my recommendations, not options.
- **"give me first a scenario if all of that built"**: likes a narrative walkthrough before big builds (thesis-defense framing).
- **"how to deploy"** while having the README ssh line selected: needs explicit "Vercel only vs deploy.sh on the server" each time.
- **"merged and deployed. check it"** / **"merged, what's next?"**: verify with git fetch, check-runs API, Vercel status, `/health`, and an endpoint probe; answer with tables; end with an ordered next-steps list and one "say go" question.
- **Sends screenshots as the verification of record** (charts, errors, phone screens, Azure portal, dashboards); trust them over assumptions; don't reproduce patient names from them.
- **"the web worker is not on the thesis but the client said include it, and the qr scanning too"**: client requirements win; keep workers and in-app QR scanning working.
- **"can i first auto off the vm on 2AM since i'll stay up night developing the other needs?"**: works late; plans more features ("other needs", not yet specified).
- **"can you please make the ui/ux of them more good, and has a container and more good icon use, i want to make it more feels like its lively, specially on the System adm, because its just a green dot"** → delivered #53; **"i have seen changes, i like it"**.
- **"I want you now to /handoff so i can start this session on a fresh session"**: prefers fresh sessions via handoff + paste prompt.
- **Commits/pushes/merges/deploys themselves**: give exact `git add -- <paths>`, `git commit -F <scratchpad file>`, push, compare URL, PR-body path, expected "N files changed" (verified with `git add --dry-run`). All counts were right this session.
- **Reads PR bodies in the IDE** (selected the whole PR body several times before posting).
- (Carried) Clear, non-technical UI wording; never put secrets/patient details in output; never send them into nano/cat on `.env`; repo is public; always say "on the server (prompt `azureuser@smarthealth-server`)" for server commands.

## Where We're Going

1. **START HERE: build the approved export change (one PR, needs deploy.sh).** User approved with "go, all defaults" but it was never built:
   - `/analytics/export` guard → `require_role("admin","bhw","physician")` (keep admin_staff out); update the docstring + `navigation.ts`/Reports page visibility if needed (Analytics link already shows for admin/bhw/physician).
   - Write one audit row per export via `write_audit_log` (action e.g. `EXPORT_REPORT`; details: report_type, from/to, row count, format; NO row contents). Check `audit_log.py` action list/constraint and `audit_query_service` filters for the new action name.
   - Admin (model B): drop `chief_complaint` from the **visits** export when the caller is admin.
   - Tests first (backend: physician allowed, admin_staff 403, audit row written with counts only, admin visits rows have no chief_complaint).
2. **Optional dashboard PR 2** (ask once, recommend): demographics (an existing `PatientDemographicsChart` on Analytics already consumes `senior_count/pwd_count/pregnant_count`; fix its stale comment and consider reusing it on Physician/Admin dashboards), **return rate after SMS reminders** (appointments with a reminder `sms_logs.appointment_id` → status completed vs missed), **Resend failed SMS** for BHW (new endpoint; check `sms.py` `_send_role` and SMS service).
3. **Small security cleanup:** `frontend/web/proxy.ts` public check `startsWith("/verify")` → match `/verify` exactly or `/verify/`, `/verify?` plus `/verify-otp` explicitly; add a unit test listing public vs protected paths.
4. **User checks:** in-app QR scanner (Health Cards → Verify → QR Code, device with camera, hard reload first) reads a card and opens the quick view; tomorrow (Nov 22) after 10:00 the Admin dashboard "Reminder runs" should show Immunizations with a time + N SMS (first live #44 run); OTP email screenshot in a real inbox; paste `pr44-why-corrected.md` text into PR #44 (from seq 10; that scratchpad was session-only, may need regenerating from the parent's description).
5. **Data for the demo:** fill `sitio_purok` for demo patients so the BHW dashboard groups by purok (today everything is "No sitio/purok recorded").
6. **Defense readiness (user-only, remind once):** reprint cards printed from the screen before #50; write the final NTAG215 from the demo patient's Print page; load the gateway SIM + test SMS; Filipino SMS native-speaker review; deactivate allergy test patient; manuscript wording (Recharts, WeasyPrint, OTP+passkeys, web workers per client, remove the AI-doc footer).
7. **Optional cleanups (ask first):** `setex` deprecations (`mfa_service.py:~149`, `passkey_service.py:99`); `datetime.utcnow()` / `HTTP_422_UNPROCESSABLE_ENTITY`; `asyncio_default_fixture_loop_scope`; ruff findings in `tests/conftest.py` (8) / `test_health_cards.py` (3: 2 F401, 1 I001, same as main); empty `app/(dashboard)/users/`; legacy `backend/scripts/backup_db.py`; delete disabled `.github/workflows/deploy.yml`; `immunization.py` model docstring; 6 `set-state-in-effect` lint warnings in `hooks/useAnalytics.ts`; `PatientDemographicsChart` stale comment; favicon 404 (`/favicon.ico`).

## Risks & Blockers

- **SQLAlchemy 2.0 (local) vs 2.1 (CI/Docker) typing gap**: run mypy against 2.1 (`sa21` recipe in memory `local_db_tests.md`) before handing over SQLAlchemy-typed code. Runtime behaviour on 2.1 is fine (CI pytest green).
- **Browser cache after Vercel deploys**: users keep old JS until a full reload; symptoms look like "fix didn't work" (e.g. `r.apply is not a function`). Always ask for Ctrl+Shift+R before re-diagnosing.
- **jsdom has no `Worker`**: unit tests never touch worker paths; verify workers in `.next/static/chunks` (see memory `web_workers_testing.md`).
- **Frontend-before-backend window**: Vercel deploys on merge, backend after `deploy.sh`; new endpoints need a frontend fallback (pattern: 404 → old behaviour).
- **Waiting-queue semantics**: an undiagnosed visit stays "waiting" until Manila midnight, then silently drops off (it is not carried to the next day). The user's 9:45 PM test visit with no vital signs will be gone tomorrow; if a real patient is logged and not seen the same day, nothing reminds the physician. Acceptable for a same-day clinic; mention if the user asks for a "still undiagnosed" list.
- **Admin dashboard cost**: each load runs `collect_system_status()` (DB size, Redis, worker heartbeat, disk, media scan, backup status file, SMS/sign-in counts, reminder markers) plus three anomaly queries. Fine for one admin; if it feels slow, cache the `system` section for ~60 s rather than dropping it.
- **Export currently releases names + chief complaints without an audit trail** (Admin and BHW). Not a regression this session, but it's the main open compliance gap; step 1 fixes it.
- (Carried) Gateway SIM has no load (SMS cards may go amber/red, accurate); `POSTGRES_PASSWORD`/`ENCRYPTION_KEY` not rotated; CI logs unreadable by Claude (user pastes); VM now auto-stops at 02:00 Manila (plan deploys before then; a deploy after 10:00 skips that day's immunization Beat run, caught up next day by #44).

## Open Questions

1. Exact audit action name and detail format for exports: is there a constraint/enum on `audit_logs.action` (check `models/audit_log.py`) and does the Audit Log page filter need the new action?
2. Should Physician's visits export also omit `chief_complaint`? (Default from approval: only Admin drops it; Physician keeps it.)
3. Does the new OTP email look right in Gmail/phone (panel width, digit boxes, Gmail "Copy code" chip)? Needs a screenshot.
4. What are the user's "other needs" for tonight? Not specified yet.
5. Does the **in-app** QR scanner (Health Cards → Verify → QR Code tab, a device with a camera) read a card now? Needs a real-camera check; only the phone's own camera app was tested.
6. Should the BHW "Log visit" quick action go somewhere better than the Patients list (e.g. a patient picker that opens `/patients/{id}/visits/new`)? Built as `/patients` because there is no patient-less Log Visit page.
7. (Carried) Filipino SMS wording native-speaker review before the defense?

## Quick Start for Next Session

```bash
# Reference docs
cat plans/handoffs/HANDOFF_role-dashboards-live_2026-11-21.md
cat CLAUDE.md

# Key files (explore adjacent code too)
backend/app/api/v1/endpoints/analytics.py          # /export guard _ADMIN_OR_BHW (line ~66), no audit
backend/app/services/analytics_service.py          # export_report_data (~475): names, codes, chief_complaint
backend/app/services/audit_service.py              # write_audit_log
backend/app/models/audit_log.py                    # action names / constraint
frontend/web/app/(dashboard)/analytics/reports/page.tsx   # export UI (CSV via web worker)
backend/app/services/dashboard_service.py          # role dashboards (#51)
frontend/web/components/dashboard/shared.tsx       # dashboard design system (#53)

# Verify current state (PowerShell on PC)
git fetch --prune; git switch main; git pull; git log --oneline -3     # expect a019cca (+ handoff docs merge)
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health
curl.exe -s -o NUL -w "%{http_code}" https://smarthealth-hub.japaneast.cloudapp.azure.com/api/v1/dashboard/me   # 401 = deployed
# Full backend suite locally (memory local_db_tests.md; Docker Desktop must run):
#   docker run -d --rm --name shh-test-pg -e POSTGRES_USER=shh_test -e POSTGRES_PASSWORD=shh_test -e POSTGRES_DB=smarthealthhub_test -p 127.0.0.1:5499:5432 postgres:18-alpine
#   docker run -d --rm --name shh-test-redis -p 127.0.0.1:6399:6379 redis:7-alpine
#   cd backend; $env:DATABASE_URL="postgresql+asyncpg://shh_test:shh_test@127.0.0.1:5499/smarthealthhub_test"; $env:REDIS_URL="redis://127.0.0.1:6399/0"; python -m pytest -p no:warnings -o addopts=""   # expect 510 passed
#   docker stop shh-test-pg shh-test-redis
cd frontend/web; pnpm exec vitest run                                    # expect 150 passed
# mypy against CI's SQLAlchemy 2.1: see memory local_db_tests.md (sa21 recipe)

# Next action
# Build the approved export change test-first: physician may export, admin_staff may not,
# one audit row per export (counts only), admin's visits export without chief_complaint.
```

## Session Closed
**Closed at:** 2026-11-21 22:35 (Manila, UTC+8), after #53 was merged (Vercel deployed) and the user approved the redesign
**Commit:** the `session: role-dashboards-live [standalone-9d299342]` commit on branch `docs/handoff-seq11` that includes this note (run by the user from the commands Claude provided; merge via PR, docs only, no server update needed)
**Session status:** Handed off to next session
