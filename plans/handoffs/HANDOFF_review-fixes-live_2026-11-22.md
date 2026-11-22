# Export audit, public forms, SMS-reminder return rate, visit→appointment completion, SMS resend, visit case-number fix, themed card check + QR camera picker, clearer Analytics, OTP code in subject: all merged (#54–#61); next: confirm #61 deploy, demo data, defense readiness

**Date:** 2026-11-22
**Status:** COMPLETED (8 PRs merged this session; all CI green on `main` = `ccd12a2`; server deploy of #61 not yet confirmed by the user)
**Bead(s):** none (`bd` CLI not installed on this PC)
**Epic:** Deploy SmartHealth Hub to production and harden it for the thesis defense (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `12`
**Parent:** `HANDOFF_role-dashboards-live_2026-11-21.md`
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > `HANDOFF_nfc-backups-done_2026-11-19.md` > `HANDOFF_phase9-system-health-done_2026-11-19.md` > `HANDOFF_phase10-admin-model-b-done_2026-11-19.md` > `HANDOFF_allergies-media-banner-done_2026-11-20.md` > `HANDOFF_sidebar-and-admin-next_2026-11-20.md` > `HANDOFF_admin-security-settings-done_2026-11-20.md` > `HANDOFF_reliability-done-deploy-pending_2026-11-20.md` > `HANDOFF_signin-hardening-dashboard-next_2026-11-21.md` > `HANDOFF_role-dashboards-live_2026-11-21.md` > this

> ⚠️ This repo is **PUBLIC**. This file deliberately contains no passwords, keys,
> email addresses, phone numbers, patient names/codes, staff names, real OTP
> codes, NFC signatures or chip serials. The user's screenshots this session
> showed a real demo patient name + patient code on the phone card-check page
> and a real (now expired) OTP in Gmail: none are reproduced here and must
> never be. Names in tests ("Ana Reyes", "Wrong Number", "Exportia Testcase")
> and the "286526"-style example in the PR body are invented.

---

## Stale References

Identifiers from the parent (seq 11) that changed on purpose this session:

- `_ADMIN_OR_BHW = require_role("admin","bhw")` in `backend/app/api/v1/endpoints/analytics.py`: **gone**. Now `_EXPORT_ROLES = require_role("admin","bhw","physician")` and `export_report` takes `request: Request` + `current_user: User = _EXPORT_ROLES` (#55).
- Parent's "Export has no audit row": **fixed**; every export writes `EXPORT_REPORT` (#55).
- `health_cards.py` full-verify `action="PHI_VIEW"`: **gone**, now `"VIEW_PHI"` (#55). `audit_anomaly_service.check_phi_view_burst` now matches `_PHI_VIEW_ACTIONS = ("VIEW_PHI","PHI_VIEW")` with `PHI_VIEW_BURST_THRESHOLD = 50`.
- `frontend/web/proxy.ts` inline `pathname.startsWith("/verify")` etc.: **gone**. Logic moved to `frontend/web/lib/public-paths.ts` `isPublicPath()` (whole-segment match) (#56).
- Parent's trick "temporary `app/verify-dashboard-preview/page.tsx` renders without login": **no longer works** (proxy fix #56). For visual checks, set a fake `access_token` cookie in Playwright instead (see Tooling Gotchas).
- `visit_service.create_visit` default `datetime.utcnow()`: **gone**, now `datetime.now(tz=UTC)` (#58).
- `visit_service._next_case_no` `Visit.case_no.like(f"{prefix}%")`: **gone**, now regex `Visit.case_no.op("~")(f"^{prefix}[0-9]{{6}}$")` (#60).
- `email_service._otp_subject(purpose)`: **signature changed** to `_otp_subject(otp_code, purpose)`; subject now starts with the code (#61). Test renamed `test_subject_names_the_code_but_never_contains_it` → `test_subject_starts_with_the_code`.
- OTP email `or copy: <span class="otp-copy">`: **gone**, replaced by `<td class="otp-copy-box">` "Tap and hold the code below to copy it" (#60).
- `app/verify/page.tsx` inline-style teal/grey `VerifyLayout` / `ValidCard` / `InvalidCard`: **rewritten** in Tailwind rose theme (#60); headings now "Card verified" / "Card not active" / "We couldn't verify this card"; staff button "Sign in to view the full record".
- Analytics page `KpiCard`/`ChartCard(badge)`/`SubPageCard`/"Explore" section/"Live" badge: **rewritten/removed** (#60). New `Section`, `Period`, `ChartCard(period)`.
- Test helpers `abs(hash(email)) % 100000` mobiles in `conftest.make_user`, `test_analytics._create_user`, `test_passkey`: **gone**, now `tests.conftest.unique_mobile()` (#59).
- Still stale (not changed): `frontend/web/components/charts/PatientDemographicsChart.tsx:8` comment "backend /analytics/overview does not yet expose seniorCount / pwdCount / pregnantCount" (the backend does; cleanup item).

## Since Last Handoff

- **Parent step 1 (export permissions + audit)**: built and merged as **#55** exactly as approved ("go, all defaults"): physician may export, admin_staff 403, one `EXPORT_REPORT` audit row per export (no row contents), Admin's visits export drops `chief_complaint`. Plus the PHI-view alert fix found during onboarding.
- **Parent step 2 (optional dashboard PR 2)**: user said "go" → built "return rate after SMS reminders" (**#57**) after a sketch; demographics on dashboards skipped (Analytics already has it); "Resend failed SMS" built later (**#59**).
- **Parent step 3 (proxy hardening)**: built as **#56**, and it uncovered a much bigger bug: `/register` and `/intake` (public patient forms, poster QR + social media) redirected anonymous patients to `/login` in production.
- **Parent step 4 (user checks)**: in-app QR scanner → user's screenshot showed a phone-as-webcam "no phone" picture → camera picker added (**#60**); OTP email screenshot received → copy box (**#60**) + code in subject (**#61**); "10:00 immunization run" still not reported; PR #44 text paste not mentioned.
- **Parent step 5 (sitio_purok demo data)**: still open; decided it must be done **in the UI** (audited), not by script.
- **New work driven by findings / user**: #58 (visit completes same-day appointment; found while designing #57), "Failed to save visit" production bug → **#60** case-number fix, design complaints → #60 (card-check page theme, Analytics clarity, Export at top).
- **Parent open questions**: Q1 audit action name → `EXPORT_REPORT` (no DB constraint on `audit_logs.action`); Q2 physician keeps `chief_complaint` → yes (default); Q3 OTP email look → screenshot received, then changed; Q5 in-app QR scanner → works, but wrong camera chosen on the user's laptop; Q4/Q6/Q7 unanswered.
- **Risk that materialized**: CI pytest failed once on #55's merge (`f9f8d4e`) with identical code that passed on its branch 5 minutes earlier → flaky test; most likely cause (hash-derived test mobile collisions) fixed in #59. Not seen again on #56–#61.
- **Trajectory**: still hardening for the defense; the user now reviews production by screenshots and asks for UX polish ("not the same theme", "a bit confusing"). Every feature this session shipped as one PR per user turn, the user merges + deploys + reports back.

## Reference Documents

- `CLAUDE.md`: conventions (Admin model B, audit every write, Alembic-only schema changes, AES-256-GCM fields, module boundaries, PHI never on NFC/QR).
- `docs/SmartHealth_Hub_System_Development_Plan.md` (git-ignored, local): authoritative scope (SDP §6.7 analytics, §6.8 SMS, §7.4.4 web workers).
- `DEV-WORKFLOW.md`: §5 local test DB via Docker, §6 `deploy.sh`, §9 server cheat sheet + scheduled jobs (VM auto-shutdown 02:00 Manila), §10 backups.
- Parent: `plans/handoffs/HANDOFF_role-dashboards-live_2026-11-21.md` (role dashboards #51/#53 internals, dashboard design system table, frontend test patterns).
- Claude memory (`C:\Users\githu\.claude\projects\c--Users-githu-OneDrive-Documents-smarthealth-hub\memory\`): `project_scaffold.md`, `pnpm_not_npm.md`, `feedback_no_secret_screens.md`, `deployment_setup.md`, `local_db_tests.md` (sa21 mypy recipe), `web_workers_testing.md`, `feedback_ci_logs.md`. No memory files were added or changed this session.

## The Goal

SmartHealth Hub (thesis: Barangay Health Center records with NFC/QR health cards, SMS reminders, OTP MFA) runs in production for the thesis defense: website `https://smarthealth-hub-two.vercel.app` (Vercel, auto-deploys on merge to `main`), API `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose, deployed by hand with `bash scripts/deploy.sh` **on the server**). This session closed the compliance gap on report exports, opened the public patient forms that were silently blocked, gave the thesis's SMS objective measurable evidence (return rate with vs without a reminder), fixed two data-quality bugs (appointments wrongly "missed", visits failing to save), added BHW tools (Resend failed SMS), and polished the screens the user reviewed (card-check page, Analytics, OTP email). Remaining: confirm the last deploy, demo data (sitio/purok), and defense readiness items.

## Where We Are

### Production
- `origin/main` = **`ccd12a2`** (merge of #61). Local `main` = `ccd12a2`. Local branches: `main` + `docs/handoff-seq12` (this file). All feature branches deleted after merge.
- CI on `ccd12a2`: pytest ✅, mypy ✅, lint BE ✅, lint FE ✅, tsc ✅, FE build ✅, Docker build ✅; Vercel ✅.
- `/health` → `{"status":"ok","service":"smarthealth-hub-api","version":"0.1.0"}` at handoff time.
- **Deploy status per PR** (backend changes need `deploy.sh`):
  - #55 export audit: deployed ✅ (OpenAPI description showed "Admin, BHW and Physician only"; user verified all 3 checks).
  - #56 proxy: Vercel ✅; verified by curl (`/register` 200, `/intake` 200, `/dashboard` 307) and by the user.
  - #57 reminder effect: deployed ✅ (`/analytics/appointments/reminder-effect` 401 unauth, in OpenAPI; `BhwDashboard` schema has `reminder_effect`); user verified all 3 checks.
  - #58 visit completes appointment: merged + CI ✅; no API shape change so not externally provable; user said "merged and deployed".
  - #59 SMS resend: merged + CI ✅; user did not explicitly report a deploy, but #60's deploy (which the user verified: "I have checked it all, it is all visible now") includes it.
  - #60 review round: deployed ✅ (user verified 5 checks incl. two visits saving in a row).
  - **#61 OTP code in subject: merged + CI ✅; server deploy NOT confirmed** (the user merged it before asking for this handoff). Needs `deploy.sh` + a phone check.
- Uncommitted on purpose (never commit without asking): `README.md` (user's ssh line ~134), `backend/celerybeat-schedule-shm`, `backend/celerybeat-schedule-wal`, `START.md`, `dump.rdb`, `start-tunnel.ps1`. `stash@{0}` (old "WIP on main: d041507 …") still present. Don't drop.

### What exists now (by feature)
- **Export** (`GET /api/v1/analytics/export`): roles admin/bhw/physician; admin_staff 403; one `EXPORT_REPORT` audit row per export, `entity_type="report"`, metadata `{report_type, from_date, to_date, format, row_count, role}` + client IP; Admin's visits rows have no `chief_complaint` (column not selected). Reports page footer: "Reports contain patient names and codes. Every export is recorded in the audit log." Audit Log page filter includes `EXPORT_REPORT` (violet badge).
- **PHI-view alert**: `check_phi_view_burst` counts `VIEW_PHI` + legacy `PHI_VIEW`, >50 per user per 60 min, detail "User … viewed N patient records in the last 60 minutes".
- **Public paths** (`lib/public-paths.ts`): pages `/login`, `/verify-otp`, `/forgot-password`, `/verify`, `/register`, `/intake` (+ sub-paths); prefixes `/api/`, `/_next/`; exact `/`, `/favicon.ico`; static file extensions. `/nfc-monitor`, `/health-cards/verify`, `/registrations` stay protected (tested).
- **Reminder effect**: `analytics_service.get_reminder_effect(db, *, from_date, to_date, now=None)` + `get_reminder_effect_last_days(db, days, now=None)`; endpoint `GET /api/v1/analytics/appointments/reminder-effect?days=30` (1–365, any staff); BHW + Admin dashboards carry `reminder_effect` (30 days); frontend `ReminderEffectPanel` on both dashboards, `ReminderEffectCard` (30/90 toggle) on Analytics.
- **Visit → appointment**: `appointment_service.complete_appointments_for_visit(db, *, patient_id, visit_id, user_id, ip_address)` called inside `visit_service.create_visit` before commit; completes pending/confirmed/missed appointments of that patient on the visit's Manila day; UPDATE audit row each (`changed_fields {status: completed}`, `previous_status`, `trigger: visit_logged`, `visit_id`).
- **SMS resend**: `POST /api/v1/sms/logs/{id}/resend` (admin, bhw; 10/min/user) → new `sms_logs` row (`metadata.resend_of`), patient's current number, fresh CONFIRM code for appointment reminders, CREATE audit row on `sms_log`; 409 with plain reason when refused; BHW dashboard `failed_sms` rows carry `resent` + `can_resend`; "Resend" button / "Resend queued" / "Resent" chips.
- **Visit case numbers**: `_next_case_no` only considers `^BHC-VISIT-{YEAR}-[0-9]{6}$` → after seeded hex numbers + `000001`, next is `000002`. User confirmed two visits in a row save.
- **Card check page** `/verify` (public): rose theme, `/BHCFINALLOGO.png` (alt "Barangay Health Center logo"), DM Serif heading, teal/amber/red states, initials avatar, mono patient code, status chip, staff button → `/login?next=/patients/{pid}`; footer "This page shows only the name and patient code on the card. No health records are shown."
- **In-app QR camera picker** (Health Cards → Verify → QR Code): when >1 `videoinput`, a "Camera" `<select>`; choice in `localStorage["shh.qrCameraId"]`; falls back to default if the remembered camera is gone (and clears it).
- **Analytics** (`/analytics`): header buttons Illness trends + **Export reports** (rose, top right); sections "At a glance" (4 KPI, 2-per-row on phones), "Visits" (visits per week · Last 12 weeks; visit types · Last 30 days), "Patients" (priority groups · All active patients; vaccination coverage · All records), "Reminders and follow-up" (SMS reminders card; "Patients who may miss their appointment" · Next 7 days · Full report → `/analytics/ai`).
- **OTP email**: subject `"{code} is your SmartHealth Hub sign-in code"` / `"… password reset code"`; body keeps digit boxes + dashed "Tap and hold the code below to copy it" box (`user-select:all`); preheader still has no code; subject never logged (tested).
- **Tests**: backend full suite **582 passed** (session start 510); frontend vitest **206 passed** (session start 150).

## What We Tried (Chronological)

1. **Onboarding (read-only)**: handoff file was not on `main` (only on pushed branch `docs/handoff-seq11`, no PR yet) → read via `git show docs/handoff-seq11:plans/handoffs/...`. `bd` missing. Read export endpoint/service, audit service/model, tests. **Found**: no DB constraint on `audit_logs.action` (plain `String(50)`) → no migration; old test `test_export_requires_admin_or_bhw` asserted physician 403; Audit Log page has a hard-coded `ACTIONS` filter list; **`check_phi_view_burst` matched `"PHI_VIEW"` while 7 writers use `"VIEW_PHI"`** (only card full-verify wrote `PHI_VIEW`) → the mass-viewing alert ignored nearly all record views. User: "go, all defaults" (incl. bundling the alert fix).
2. **#55 export audit (test-first)**: baselines 510 backend / 150 frontend. New `tests/test_export_audit.py` (9) + `tests/test_phi_view_burst.py` (7) + flipped old test → red **10 failed / 7 passed** (the 7 held already: admin_staff 403, unauth 401, threshold edges). Frontend `ExportAudit.test.tsx` red **3 failed**. Had to add `PHI_VIEW_BURST_THRESHOLD` constant first (pure refactor) to turn an ImportError into a behavioural red. Implementation green 60 targeted; full **526 passed**; vitest 153. CI `ruff format --check backend/app` would have failed on 2 files → ran `ruff format` (CRLF preserved). mypy clean under SQLAlchemy 2.0 and 2.1.
3. **CI red on #55 merge (`f9f8d4e`)**: only "Test — Backend (pytest)" failed; annotations only "Process completed with exit code 1"; same code passed on branch `01be091` at 15:00 UTC, failed at 15:05 UTC. Hypothesis "Manila-midnight time dependence" (23:05 Manila) → dashboard tests use explicit `_at(day, 12)`, not supported. Local full run at 23:20 Manila on merged main: **526 passed** → not reproducible. Conclusion: flaky; likely cause found later = test users' mobiles from `abs(hash(email)) % 100000` (str hash randomized per process) colliding on `users.mobile_number` unique → fixed in #59. Never got the job log (Claude can't read CI logs).
4. **#56 proxy**: while tightening `startsWith("/verify")`, curl on production showed `/register` **307 → /login** and `/intake` **307 → /login** (public patient forms; `POST /intake-applications` is public by design, rate-limited 3/10 min/IP, returned 422 unauth = route open). Extracted `isPublicPath()` to `lib/public-paths.ts` (pure, testable). Tests `public-paths.test.ts` (30) red **8 failed / 22 passed**. Green 30; vitest 183; `next build` showed `ƒ Proxy (Middleware)`.
5. **Reminder-effect design** (user asked for a sketch first): read `sms_logs` (3 appointment-linked SMS sources: 24 h reminder with `confirmation_token`, booking-time SMS from `appointment_service._create_sms_reminder` (no metadata), after-miss follow-up `metadata.trigger = "post_miss_followup"`), mark-missed job (18:00 Manila marks pending/confirmed past → missed + texts patient), completion = manual button only, visits not linked to appointments. **Key insight**: status-only "came" under-counts → defined came = completed OR visit on same Manila day. Sketch + 7 defaults → "go, all defaults".
6. **#57 reminder effect (test-first)**: `tests/test_reminder_effect.py` (24) red **22 failed / 2 passed**; Manila-midnight edge cases (visit 23:30 Manila same day counts; 00:30 next day doesn't). SQL uses `func.date(func.timezone("Asia/Manila", col))`. Green 71 targeted; full **550**; frontend `ReminderEffect.test.tsx` (8) red **7 failed / 1 passed**; vitest 191. eslint: avoided adding a new `set-state-in-effect` warning by deriving `loading` from `result.days !== days` (setState only in promise callbacks). No visual check (old public-preview trick blocked by #56).
7. **#58 visit completes appointment (test-first)**: `tests/test_visit_completes_appointment.py` (8) red **4 failed / 4 passed**. Then `test_visit_without_a_date_uses_today` failed at 00:24 Manila: `visit_date = data.visit_date or datetime.utcnow()` is **naive**; asyncpg read it in the host's local zone (PC = Manila) → stored 8 h off → previous Manila day. Fixed to `datetime.now(tz=UTC)`. Production containers run UTC, so prod data was unaffected; website always sends `toISOString()` (aware). Full **558 passed**.
8. **#59 SMS resend + unique test mobiles (test-first)**: `tests/test_sms_resend.py` (18) red **17 failed / 1 passed** (unknown-id 404 held only because the route didn't exist). Rules in new `app/services/sms_resend_service.py` shared by endpoint + dashboard. CONFIRM-code reuse would break `sms.py` inbound lookup (`scalar_one_or_none` by token with `status != "replied"` → 2 rows) → fresh `secrets.randbelow(9000)+1000` code, rewritten in text via `re.sub(r"CONFIRM \d{4}")`. Frontend `SmsResend.test.tsx` (4) red **3 failed / 1 passed**. Test mobiles → `conftest.unique_mobile()` (`+63998` + 7-digit `itertools.count()`). Full **576**; vitest **195**.
9. **User review round (screenshots)**: (a) "Failed to save visit: A resource with the given data already exists or a constraint was violated." (b) in-app QR tab showed a crossed-out phone picture, (c) phone card-check page "not the same theme", (d) OTP email "no button that can copy the code", (e) Analytics "a bit confusing", export at the bottom.
   - (a) Root cause: `seed_db.py:429` writes `case_no=f"BHC-VISIT-{year}-{uuid.uuid4().hex[:8].upper()}"`; `MAX(case_no)` picks a hex one (sorts above `000001`), regex `^BHC-VISIT-(\d{4})-(\d{6})$` fails → seq restarts at 1 → `000001` duplicate → unique violation → generic 409 handler message (`app/core/exceptions.py:246`). Test `test_visit_case_no.py` reproduced **the exact production message**; red 2 failed / 1 passed.
   - (b) Not a page bug: teal frame = `phase === "scanning"`; the picture comes from the selected camera (Windows Phone Link / DroidCam / Camo virtual camera without a phone). Added camera picker; `CameraPicker.test.tsx` (4) red 3 failed / 1 passed.
   - (c) `/verify` rewritten in rose theme; `PublicVerifyPage.test.tsx` (4) red 4 failed (async server component rendered via `await VerifyPage({searchParams: Promise.resolve(...)})` + stubbed `fetch`).
   - (d) Explained a real copy button is impossible in email (no JS); built dashed "Tap and hold" copy box; test red 2 failed. Asked about code-in-subject (reverses an earlier deliberate decision) → user later said yes.
   - (e) Analytics rewritten into 4 sections; `AnalyticsPage.test.tsx` (3) red 3 failed. Visual check with Playwright + fake API + fake cookie → mobile KPI cards changed to 2 per row.
   - All in one PR (#60) with 4 commits; full backend **579**, vitest **206**.
10. **#61 OTP code in subject**: user: "yes … i want it to like it has a button not chip … only tap the button to copy". Re-explained no email can contain a working copy button; the real one-tap button is Android's notification "Copy" (needs code in subject/notification text). Implemented `_otp_subject(otp_code, purpose)`; tests red 3 failed; full **582 passed**. Merged by user before this handoff; deploy not confirmed.

## Key Decisions

- **`EXPORT_REPORT` audit metadata describes the export, never its rows** (report type, dates incl. resolved defaults, format, row_count, role, IP). Rejected: logging patient codes per export (would copy PHI into audit_logs).
- **Admin visits export drops the `chief_complaint` column entirely** (not blanked) — Admin model B. BHW + physician keep it (approved default).
- **PHI-view alert counts both `VIEW_PHI` and legacy `PHI_VIEW`**; writer normalized to `VIEW_PHI`. Rejected: migrating old audit rows (append-only table with no-update rules).
- **Public-path rule = whole path segment** (`p === page || p.startsWith(page + "/")`), in a pure module with tests. Rejected: keeping prefix `startsWith` (any future `/verify…` page would be public).
- **Reminder effect "came" = completed OR visit logged on the appointment's Manila day**; "reminded" = SMS sent/delivered/replied **created before** `scheduled_at`, excluding `post_miss_followup`; booking SMS counts; still-open (pending/confirmed, no visit) and cancelled excluded; groups < 10 → no percentage (`REMINDER_MIN_GROUP = 10`). Counts only (OK for Admin model B).
- **Dashboard fields that need a new backend are optional in TS** (`reminder_effect?`, `resent?`, `can_resend?`) → between Vercel deploy and `deploy.sh` the UI just hides the feature. Analytics card shows an error until deploy (acceptable, documented).
- **Logging a visit completes pending/confirmed/missed appointments on the same Manila day**, inside the visit transaction, audited. `missed` included so late-logged visits correct the record. Rejected: linking visits to appointments by FK (migration + UI change).
- **SMS resend creates a new row, never edits the failed one** (failed row is history); uses patient's **current** number; fresh CONFIRM code; refusals are 409 with human-readable reasons shared with the dashboard (`resend_problem`). Roles admin + bhw (same as SMS Logs).
- **`sitio_purok` for demo patients must be filled in the UI** (Patients → Edit → Sitio / Purok), not by a bulk script: production has 61 active patients (not just 25 seeded), a script could overwrite real addresses and would bypass the audit trail.
- **Case-number fix filters by regex instead of rewriting seeded data** (no data migration; existing rows keep their numbers).
- **No fake "Copy" button in the OTP email**: impossible without JS; a button that only selects text would mislead. Code in subject approved by the user (trade-off: visible in notification previews; 10-min expiry; useless without password). Subject never logged.
- **Camera choice stored per browser in `localStorage`** with try/catch; default constraints `{ facingMode: "environment" }` kept for phones.
- **One PR per user turn, multiple commits** when several items land together (#60 = 4 commits) because the user commits/pushes themselves and uncommitted work can't be split across branches cleanly.

## Evidence & Data

### PR / commit log (this session, all merged to `main`)
| PR | Branch | Commits | Merge | Summary | Files | Deploy |
|---|---|---|---|---|---|---|
| #54 | docs/handoff-seq11 | `62b35d1` | `77501b3` | seq 11 handoff | 1 | none |
| #55 | feat/export-audit | `0e08236` export, `01be091` PHI alert | `f9f8d4e` | export roles + EXPORT_REPORT + admin no chief_complaint; VIEW_PHI alert | 9 + 3 | deploy.sh ✅ |
| #56 | fix/proxy-public-paths | `312e500` | `c7ae200` | /register + /intake public; whole-segment match | 3 | Vercel ✅ |
| #57 | feat/reminder-effect | `ee51048` BE, `234882f` FE | `0b6647e` | return rate after SMS reminders | 6 + 8 | deploy.sh ✅ |
| #58 | feat/visit-completes-appointment | `1c42516` | `4f1170e` | visit completes same-day appointment; tz-aware default | 3 | deploy.sh (user said done) |
| #59 | feat/sms-resend | `f46d298` BE, `babd9ec` FE, `fc1da2d` tests | `b844542` | Resend failed SMS; unique test mobiles | 5 + 3 + 3 | deploy.sh (covered by #60's) |
| #60 | fix/review-round | `0f26d62` case no, `fdea0b7` email box, `dfe1b5b` verify+camera, `37fb11c` analytics | `023e548` | review fixes | 2 + 2 + 4 + 3 | deploy.sh ✅ (user verified 5 checks) |
| #61 | feat/otp-code-in-subject | `c83cf92` | `ccd12a2` | OTP code first in subject | 3 | **deploy.sh not confirmed** |

### Per-commit size (git show --stat)
| Commit | Files | +/- |
|---|---|---|
| `01be091` | 3 | +138 −12 |
| `0e08236` | 9 | +387 −53 |
| `312e500` | 3 | +121 −19 |
| `ee51048` | 6 | +663 −5 |
| `234882f` | 8 | +463 |
| `1c42516` | 3 | +331 −4 |
| `f46d298` | 5 | +638 −11 |
| `babd9ec` | 3 | +187 −20 |
| `fc1da2d` | 3 | +17 −6 |
| `0f26d62` | 2 | +114 −1 |
| `fdea0b7` | 2 | +26 −4 |
| `dfe1b5b` | 4 | +365 −129 |
| `37fb11c` | 3 | +236 −245 |
| `c83cf92` | 3 | +38 −9 |

### CI per merge commit
| Commit | pytest | mypy | lint BE | lint FE | tsc | FE build | Docker | Vercel |
|---|---|---|---|---|---|---|---|---|
| `77501b3` (#54) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `f9f8d4e` (#55) | ❌ flaky | ✅ | ✅ | ✅ | ✅ | ✅ | skipped | ✅ |
| `c7ae200` (#56) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `0b6647e` (#57) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `4f1170e` (#58) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `b844542` (#59) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `023e548` (#60) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ccd12a2` (#61) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Flaky pytest evidence (#55 merge)
| Run | Commit | Started (UTC) | Manila | Result |
|---|---|---|---|---|
| branch | `01be091` | 15:00:50 | 23:00 | ✅ |
| merge | `f9f8d4e` | 15:05:36 | 23:05 | ❌ (only annotation: exit code 1) |
| local, merged main | `f9f8d4e` | ~15:20 | 23:20 | ✅ 526 passed |
| next merge | `c7ae200` | 15:3x | 23:3x | ✅ (same backend code) |
Diff `01be091..f9f8d4e` = only the 505-line handoff .md. Probable cause: `abs(hash(email)) % 100000` mobile collisions (PYTHONHASHSEED random per run) → fixed #59.

### Test count history
| Point | Backend | Frontend | New tests |
|---|---|---|---|
| Session start | 510 | 150 | — |
| #55 | 526 | 153 | +9 `test_export_audit.py`, +7 `test_phi_view_burst.py`, +3 `ExportAudit.test.tsx` |
| #56 | 526 | 183 | +30 `tests/lib/public-paths.test.ts` |
| #57 | 550 | 191 | +24 `test_reminder_effect.py`, +8 `ReminderEffect.test.tsx` |
| #58 | 558 | 191 | +8 `test_visit_completes_appointment.py` |
| #59 | 576 | 195 | +18 `test_sms_resend.py`, +4 `SmsResend.test.tsx` |
| #60 | 579 (+email 18 targeted) | 206 | +3 `test_visit_case_no.py`, +1×2 `test_otp_email.py`, +4 `PublicVerifyPage`, +4 `CameraPicker`, +3 `AnalyticsPage` |
| #61 | **582** | **206** | subject test ×2 (renamed), +1 `test_otp_not_logged.py` |

### Red → green runs
| Test file | Red | Why red | Already held |
|---|---|---|---|
| test_export_audit.py + test_phi_view_burst.py | 10 failed / 7 passed | physician 403; no audit row; chief_complaint present; alert counted 0 | admin_staff 403, 401, threshold/older/separate-user |
| ExportAudit.test.tsx | 3 failed | no EXPORT_REPORT option; no audit notice; "diagnosis" in description | — |
| public-paths.test.ts | 8 failed / 22 passed | /register, /intake, /verifyx, /loginx, /login-as, /verify-dashboard-preview | everything else |
| test_reminder_effect.py | 22 failed / 2 passed | function + route missing | physician/front-desk have no field; fixture sanity |
| ReminderEffect.test.tsx | 7 failed / 1 passed | no panel/card | older server → no panel |
| test_visit_completes_appointment.py | 4 failed / 4 passed | nothing completed | "left alone" guards |
| test_sms_resend.py | 17 failed / 1 passed | route missing | unknown id 404 (route 404) |
| SmsResend.test.tsx | 3 failed / 1 passed | no button | older backend → no button |
| test_visit_case_no.py | 2 failed / 1 passed | exact prod 409 message; got 000001 instead of 000042 | first-of-year 000001 |
| test_otp_email.py (copy box) | 2 failed | no `otp-copy-box` | — |
| PublicVerifyPage.test.tsx | 4 failed | old headings / no data-theme | — |
| CameraPicker.test.tsx | 3 failed / 1 passed | no picker | single camera → no picker |
| AnalyticsPage.test.tsx | 3 failed | no header export, no sections | — |
| OTP subject (#61) | 3 failed | old subject; `_otp_subject` arity | — |

### Production probes this session
| Check | Result |
|---|---|
| `/health` (every check) | `{"status":"ok",...}` |
| `/api/v1/dashboard/me` unauth | 401 |
| `/api/v1/analytics/appointments/reminder-effect` unauth (after #57) | 401; present in `/openapi.json` |
| `/openapi.json` export description (after #55) | "...Admin, BHW and Physician only. Admin's visits export leaves out chief_complaint..." |
| verify endpoint description (after #55) | mentions `VIEW_PHI` |
| `/openapi.json` | 200 (public); `/docs` 200 |
| `POST /api/v1/intake-applications` empty body unauth | 422 (public route) |
| Website before #56: `/register`, `/intake` | 307 → `/login?next=...` |
| Website after #56: `/register` 200, `/intake` 200, `/verify` 200, `/verify-dashboard-preview` 307, `/dashboard` 307, `/nfc-monitor` 307 | ✅ |

### Case-number bug demonstration
```
rows = BHC-VISIT-2026-000001, BHC-VISIT-2026-9F3A1C0B, BHC-VISIT-2026-0A12BC34, BHC-VISIT-2026-000014
MAX -> BHC-VISIT-2026-9F3A1C0B | matches ^BHC-VISIT-(\d{4})-(\d{6})$: False  -> seq = 1 -> 000001 (duplicate)
seed_db.py:429  case_no=f"BHC-VISIT-{_today.year}-{uuid.uuid4().hex[:8].upper()}"
fix: WHERE case_no ~ '^BHC-VISIT-2026-[0-9]{6}$'
```

### Reminder-effect SQL shape (analytics_service)
```
visit_that_day = EXISTS(visits v WHERE v.patient_id = a.patient_id
                 AND date(timezone('Asia/Manila', v.visit_date)) = date(timezone('Asia/Manila', a.scheduled_at)))
reminded = EXISTS(sms_logs s WHERE s.appointment_id = a.id AND s.status IN ('sent','delivered','replied')
                 AND s.created_at < a.scheduled_at AND coalesce(s.metadata->>'trigger','') != 'post_miss_followup')
replied  = EXISTS(sms_logs s WHERE s.appointment_id = a.id AND s.status = 'replied')
window   = scheduled_at >= from 00:00 Manila AND < min(to+1 00:00 Manila, now) AND status != 'cancelled'
python: came = completed or visit_that_day; skip if not came and status != 'missed'
```

### SMS sources linked to appointments (found while designing #57)
| Source | Where | metadata | Counts as reminder? |
|---|---|---|---|
| 24 h reminder | `reminder_scheduler._dispatch_appointment_reminders_async` (~line 153) | `{confirmation_token, appointment_id}`; text ends " CONFIRM {4 digits} to confirm." | yes |
| booking SMS | `appointment_service` `_create_sms_reminder` (~line 174) | none | yes |
| after-miss follow-up | `reminder_scheduler._mark_missed_appointments_async` (~line 430) | `{"trigger": "post_miss_followup"}` | no |
| welcome | `registration_tasks.py:126` | `{"message_type": "welcome"}` | not appointment-linked |

### Resend refusal messages (sms_resend_service.resend_problem)
| Situation | Message (409) |
|---|---|
| not failed | Only failed SMS can be resent. |
| already resent | This SMS was already resent. |
| patient missing/archived | The patient record is missing or archived. |
| no number | The patient has no mobile number. Add one on the patient record first. |
| opted out | The patient opted out of SMS. |
| appointment passed/cancelled/completed (not post-miss) | The appointment has already passed, or it was cancelled or completed. |
| dose not scheduled | The dose is no longer scheduled. |

### Overview KPI periods (backend `get_dashboard_overview`, used for Analytics labels)
| KPI | Backend rule | Label |
|---|---|---|
| total_active_patients | `is_active` now | Right now |
| visits_this_week | `visit_date >= _start_of_week(now)` | This week, since Monday |
| immunizations_due_this_week | `next_due_date` today..+7, status != completed | Next 7 days |
| upcoming_appointments_count | `scheduled_at >= now`, pending/confirmed | Scheduled from today on |

### Visual-check screenshots (made-up data; session scratchpad, will be lost)
`C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\b30e2130-f7d2-4182-b194-280043b36180\scratchpad\shots\` — `verify-{ok,lost,bad}-mobile.png`, `verify-ok-desktop.png`, `analytics-desktop.png`, `analytics-mobile.png`, `analytics-mobile-top.png`, `analytics-desktop-sec-{patients,followup}.png`, `analytics-mobile-sec-{patients,followup}.png`.

## Code Analysis

- **`analytics.py` export**: `export_report(request, db, current_user: User = _EXPORT_ROLES, report_type, from_date, to_date, format)`; `include_chief_complaint=role != "admin"`; `write_audit_log(...)` then `await db.commit()` before returning JSON/CSV. Local `_get_client_ip(request)` (X-Forwarded-For first) — the codebase copies this helper per endpoint module (8 copies; `sms.py` got one too).
- **`analytics_service`**: new module constants `MANILA = ZoneInfo("Asia/Manila")`, `REMINDER_MIN_GROUP = 10`, `_REMINDER_SENT_STATUSES`, `_POST_MISS_TRIGGER`; `_manila_day(col)`; `_group(total, came)`; difference computed from unrounded ratios then `round(...,1)`.
- **`dashboard_service`**: `REMINDER_EFFECT_DAYS = 30`; `_reminder_effect(db, clock)`; BHW builder computes `already_resent = sms_resend_service.resent_ids(...)` and `resend_problem(db, log, now=clock.now, resent=...)` per failed row (≤5 rows); imports `analytics_service`, `sms_resend_service`.
- **`appointment_service`**: `VISIT_COMPLETES_STATUSES = ("pending","confirmed","missed")`; `_manila_day()`; `complete_appointments_for_visit()` computes the visit day via scalar subquery on the flushed visit row (so naive/aware input both read the same); does not commit.
- **`sms_resend_service`**: `sms_kind(log)`, `resent_ids(db, ids)` (JSONB `metadata->>'resend_of'`), `resend_problem(db, log, *, now, resent)`, `resend(db, *, sms_log_id, user_id, ip_address)` → commits; endpoint enqueues `send_reminder_task.delay(str(new.id))` in try/except.
- **`sms.py` inbound CONFIRM**: looks up `SmsLog` by `metadata.confirmation_token` + `metadata.appointment_id` not null + `status != 'replied'` with `scalar_one_or_none()` → two rows with one code would raise; tokens are random 4-digit (collisions between different patients are a pre-existing, low-probability issue).
- **`send_reminder_task` idempotency**: skips rows already `sent`/`delivered`; resend rows start `queued`.
- **`email_service`**: `_otp_subject(otp_code, purpose)`; `_build_otp_html` keeps `_digit_boxes` + `otp-copy-box`; preheader "Valid for 10 minutes. Never share it with anyone." (no code; test `test_preview_text_does_not_contain_the_code` still enforces); logs use `otp_log_fields(otp_code)` (masked outside dev); subject never in log extras.
- **Health card verify page (`app/(dashboard)/health-cards/verify/page.tsx`)**: `startCamera(deviceId?)` → wanted = arg ?? `savedCameraId()`; on failure with a wanted id → `saveCameraId(null)` + default `{ facingMode: "environment" }`; `setCameraId(track.getSettings().deviceId)`; `enumerateDevices()` after permission (labels only then); `switchCamera(id)` = stop + save + idle + start. Two eslint warnings pre-exist (scanFrame self-reference, set-state-in-effect).
- **`useReminderEffect(days)`** (`hooks/useAnalytics.ts`): state `{days,data,error}`; `loading = result?.days !== days`; no synchronous setState in effect (avoids new lint warning).
- **`lib/public-paths.ts`**: `PUBLIC_PAGES`, `PUBLIC_PREFIXES`, `PUBLIC_EXACT`, `STATIC_ASSET` regex; `proxy.ts` imports `./lib/public-paths`.

## Files Changed

### Source code (backend)
- `backend/app/api/v1/endpoints/analytics.py` (#55 export roles/audit/docstrings; #57 reminder-effect route).
- `backend/app/services/analytics_service.py` (#55 `include_chief_complaint`; #57 reminder effect).
- `backend/app/services/audit_service.py`, `backend/app/models/audit_log.py` (#55 action list docs: `EXPORT_REPORT`, never `PHI_VIEW`).
- `backend/app/services/audit_anomaly_service.py` (#55 VIEW_PHI alert).
- `backend/app/api/v1/endpoints/health_cards.py` (#55 full-verify writes `VIEW_PHI`).
- `backend/app/schemas/analytics.py` (#57 `ReminderGroup`, `ReminderEffectResponse`).
- `backend/app/schemas/dashboard.py` (#57 `reminder_effect` on BHW/Admin; #59 `FailedSmsRow.resent/can_resend`).
- `backend/app/services/dashboard_service.py` (#57, #59).
- `backend/app/services/appointment_service.py` (#58 `complete_appointments_for_visit`).
- `backend/app/services/visit_service.py` (#58 call + tz-aware default; #60 `_next_case_no` regex).
- `backend/app/services/sms_resend_service.py` (#59, new).
- `backend/app/api/v1/endpoints/sms.py` (#59 resend route + `_get_client_ip`).
- `backend/app/services/email_service.py` (#60 copy box; #61 subject).

### Source code (frontend)
- `frontend/web/app/(dashboard)/settings/audit-log/page.tsx` (#55 EXPORT_REPORT filter + badge).
- `frontend/web/app/(dashboard)/analytics/reports/page.tsx` (#55 wording/notice).
- `frontend/web/proxy.ts`, `frontend/web/lib/public-paths.ts` (#56).
- `frontend/web/types/dashboard.ts` (#57 `ReminderEffect`; #59 resend flags).
- `frontend/web/hooks/useAnalytics.ts` (#57 `useReminderEffect`).
- `frontend/web/components/dashboard/ReminderEffect.tsx` (#57, new), `frontend/web/components/analytics/ReminderEffectCard.tsx` (#57 new; #60 restyle).
- `frontend/web/components/dashboard/BhwDashboard.tsx` (#57 panel; #59 `FailedSmsItem` + Resend), `AdminDashboard.tsx` (#57 panel).
- `frontend/web/app/(dashboard)/analytics/page.tsx` (#57 card; #60 rewrite).
- `frontend/web/app/verify/page.tsx` (#60 theme).
- `frontend/web/app/(dashboard)/health-cards/verify/page.tsx` (#60 camera picker).

### Tests
- Backend: `tests/test_export_audit.py` (9), `tests/test_phi_view_burst.py` (7), `tests/test_analytics.py` (flipped test), `tests/test_reminder_effect.py` (24), `tests/test_visit_completes_appointment.py` (8), `tests/test_sms_resend.py` (18), `tests/test_visit_case_no.py` (3), `tests/test_otp_email.py` (copy box + subject), `tests/test_otp_not_logged.py` (+1), `tests/conftest.py` (`unique_mobile`), `tests/test_passkey.py`.
- Frontend: `tests/components/ExportAudit.test.tsx` (3), `tests/lib/public-paths.test.ts` (30), `tests/components/ReminderEffect.test.tsx` (8), `tests/components/SmsResend.test.tsx` (4), `tests/components/PublicVerifyPage.test.tsx` (4), `tests/components/CameraPicker.test.tsx` (4), `tests/components/AnalyticsPage.test.tsx` (3).

### Docs
- This handoff (`plans/handoffs/HANDOFF_review-fixes-live_2026-11-22.md`), on branch `docs/handoff-seq12`.

### Scratchpad (session-only: `C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\b30e2130-f7d2-4182-b194-280043b36180\scratchpad\`)
`commit-*.txt` (14 commit messages), `pr-body-*.md` (7 PR bodies), `fake_api.py` (fake API on 127.0.0.1:8765 with made-up data), `shoot.cjs` / `shoot2.cjs` (Playwright screenshot scripts), `shots/` (12 PNGs), `sa21/` (SQLAlchemy 2.1.9 for mypy), `next-dev.log`.

## User Feedback & Preferences (REQUIRED)

- **"go, all defaults"** (×3) / **"go"** / **"let's move on to the next step"**: accept my single recommendation and build without re-asking.
- **"merged and deployed, check it, and proceed to the next step"**: verify (git fetch, check-runs API, Vercel status, `/health`, endpoint/OpenAPI probe), report in tables, then continue to the next item in the same turn.
- **Sends screenshots as verification of record** and reports checks back ("the #55 all works", "all checked and existed", "I have checked it all, it is all visible now"). Trust them; never reproduce names/codes/OTPs from them.
- **Design feedback**: "the ui/ux design for the card verification is not good enough, it is not the same theme as the system"; "make the design of the Analytics not confusing, because it is a bit confusing"; "ensure that the exporting is on the top not on the very buttom". → match the system theme (rose, DM Serif, BHC logo) everywhere; put primary actions at the top.
- **OTP copy**: "on the SMTP otp it has no button that can copy the code"; then "i want it to like it has a button not chip, so user can easily copy the code … only tap the button to copy, add a lable on the button `copy code` or just copy." → wants one-tap copy; accepted code-in-subject ("yes") after the explanation that an in-email button is impossible. Expect the user may still ask for a "button": the honest answer stays the same (Android notification Copy / Gmail chip).
- **Bug reports by pasting the UI error text** ("explain why i'm encountering a `Failed to save visit: …`") → wants root cause explained in plain words plus a fix.
- **Commits/pushes/merges/deploys themselves**: give exact `git add -- <paths>` + `git commit -F <scratchpad file>` + push + compare URL + PR-body path + expected "N files changed" (verified with `git add --dry-run`). All counts were right this session.
- **Reads PR bodies in the IDE** (selects the whole PR body file before posting) → PR bodies must be complete and readable on their own.
- **Prefers fresh sessions via `/handoff` + paste prompt** when the session gets long.
- (Carried) Clear, non-technical UI wording; never put secrets/patient details in output; repo is public; never send the user into nano/cat on `.env`; always say "on the server (prompt `azureuser@smarthealth-server`)" for server commands; pnpm not npm.

## Where We're Going

1. **START HERE: confirm #61 is deployed.** Ask the user whether `deploy.sh` ran after merging #61 (`ccd12a2`). If not: on the server (prompt `azureuser@smarthealth-server`) `cd /opt/smarthealth-hub && git pull && bash scripts/deploy.sh`. Then the user checks on an Android phone with Gmail notifications: the new-mail notification shows "{code} is your SmartHealth Hub sign-in code" with a Copy action. Also merge this handoff's PR (`docs/handoff-seq12`, docs only).
2. **Demo data (user, in the UI)**: fill **Sitio / Purok** for the patients on the BHW "Immunizations due" list (Patients → patient → Edit → Sitio / Purok, e.g. "Purok 1"–"Purok 5"). Optional (ask first): add puroks to `scripts/seed_db.py` / `reset_and_seed.py` for future local seeds; also consider making `seed_db.py` write well-formed 6-digit case numbers (the generator now tolerates the hex ones).
3. **Pending user checks**: Admin dashboard → System health → reminder runs shows "Immunizations" with a time after 10:00 Manila (first live run of the #44 catch-up); BHW "Resend" on a real failed SMS (needs a failed SMS to exist; the gateway SIM has no load); SMS Reminders panel numbers once ≥10 finished appointments per group exist.
4. **Defense readiness (user-only, remind once)**: reprint cards printed from the screen before #50; write the final NTAG215 from the demo patient's Print page; load the gateway SIM + test SMS; Filipino SMS native-speaker review; deactivate the allergy test patient; manuscript wording (Recharts, WeasyPrint, OTP+passkeys, web workers per client, code-in-subject OTP, remove the AI-doc footer).
5. **Optional cleanups (ask first)**: `PatientDemographicsChart.tsx:8` stale comment; `setex` deprecations (`mfa_service.py:~149`, `passkey_service.py:99`); `HTTP_422_UNPROCESSABLE_ENTITY` / `asyncio_default_fixture_loop_scope` warnings; ruff findings in `tests/conftest.py` (7) / `tests/test_passkey.py` (3) / `tests/test_analytics.py` (3, pre-existing; tests are not linted in CI); 6 `set-state-in-effect` lint warnings in `hooks/useAnalytics.ts` + 2 in health-card verify page; empty `app/(dashboard)/users/`; legacy `backend/scripts/backup_db.py`; disabled `.github/workflows/deploy.yml`; favicon 404; IDE Tailwind hints (`focus-visible:outline` + `outline-2` duplicates, `max-w-[400px]` → `max-w-100`) on older pages.
6. **Possible follow-ups (only if the user asks)**: Resend button on the SMS Logs page (today only on the BHW dashboard); "still undiagnosed" list for the physician (waiting queue drops at Manila midnight); linking visits to appointments explicitly; 4-digit CONFIRM token collisions across patients (pre-existing).

## Risks & Blockers

- **#61 deploy unconfirmed**: until `deploy.sh` runs, OTP emails keep the old subject (no harm, just no notification Copy).
- **CONFIRM code collisions**: tokens are random 4-digit codes; two concurrently active reminders with the same code make the inbound lookup (`scalar_one_or_none`) raise → reply ignored. Pre-existing; resend uses fresh codes so it does not add duplicates of its own source.
- **Case-number race**: `_next_case_no` = MAX+1 without a lock; two visits saved at the same instant could still collide (rare at one BHC). Not addressed.
- **Visit→appointment completion is by Manila day**: a patient with two appointments the same day gets both completed by one visit (intended), and a back-dated visit completes that day's appointments.
- **Browser cache after Vercel deploys** (carried): ask for Ctrl+Shift+R before re-diagnosing "fix didn't work".
- **SQLAlchemy 2.0 (local) vs 2.1 (CI)** typing gap (carried): run mypy against 2.1 (`sa21` recipe in memory `local_db_tests.md`; the scratchpad copy will be lost: reinstall with `pip install --no-deps --target <scratchpad>/sa21 "sqlalchemy>=2.1"`).
- (Carried) Gateway SIM has no load (SMS checks amber, failed SMS exist); `POSTGRES_PASSWORD`/`ENCRYPTION_KEY` not rotated; CI logs unreadable by Claude (user pastes); VM auto-stops 02:00 Manila (deploy before then).

## Open Questions

1. Was `deploy.sh` run after #61? (Ask; not confirmed.)
2. Does the Android notification for the OTP email actually show a "Copy" action on the user's phone (depends on Android version / Gmail app)? Needs a phone check after deploy.
3. Did the 10:00 Manila immunization reminder run appear on the Admin dashboard (first live catch-up run)? Not reported this session.
4. Should `seed_db.py` / `reset_and_seed.py` be changed (6-digit case numbers, sitio/purok)? Not decided.
5. (Carried) Filipino SMS wording native-speaker review before the defense? BHW "Log visit" quick action target (still `/patients`)?

## Tooling Gotchas (cost time this session)

- **Handoff from an unmerged branch**: the paste prompt pointed at `plans/handoffs/HANDOFF_role-dashboards-live_2026-11-21.md`, which only existed on `docs/handoff-seq11` → read with `git show docs/handoff-seq11:<path>`. Merge handoff PRs before starting the next session (this one: `docs/handoff-seq12`).
- **Parallel pytest runs clash**: the session fixture creates/drops all tables, so never run two pytest processes against `shh-test-pg` at once; wait for the background run.
- **Turning an ImportError red into a behavioural red**: add the missing constant/stub first (pure refactor), then run red (used for `PHI_VIEW_BURST_THRESHOLD`, `ReminderEffectCard` stub).
- **CI runs `ruff format --check backend/app`**: always run `python -m ruff format` on changed app files (CRLF is preserved). Tests are not linted in CI (pre-existing findings there).
- **CRLF files**: many backend/frontend files are CRLF. Use the Edit tool or Python with `newline=""` and `\r\n` replacement; never `sed -i` (converts to LF). Check with `file <path>`.
- **Naive datetimes**: asyncpg interprets naive datetimes for `timestamptz` in the host's local zone → 8 h shift on the Manila-time PC (found via a test at 00:24 Manila). Always `datetime.now(tz=UTC)`.
- **Visual checks of authenticated pages**: the old `/verify-…` preview trick is dead (#56). Working recipe: fake API (`fake_api.py`, Python `http.server` on 127.0.0.1:8765) + `SERVER_SIDE_API_URL=http://127.0.0.1:8765 pnpm exec next dev -p 3123` (browser calls `/api/v1/*`, Next rewrites to `SERVER_SIDE_API_URL`) + Playwright context cookie `access_token=fake` (proxy only checks presence). Playwright lives at `node_modules/.pnpm/playwright@1.62.0/node_modules` (root, not `frontend/web/node_modules`): `NODE_PATH=<repo>/node_modules/.pnpm/playwright@1.62.0/node_modules`, `CHROME_EXE=$LOCALAPPDATA/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe`. Dashboard pages scroll inside a panel → `fullPage` captures only the first screen; scroll section headings into view (`scrollIntoView`) and take viewport shots. Stop servers: PowerShell `Get-NetTCPConnection -LocalPort 3123,8765 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`.
- **Async server components in vitest**: `render(await VerifyPage({ searchParams: Promise.resolve({...}) }))` with `vi.stubGlobal("fetch", ...)`.
- **`next build` / `next dev` rewrite `frontend/web/next-env.d.ts`** (carried) → `git checkout -- frontend/web/next-env.d.ts` afterwards.
- **`grep -rln "sitio"`** matches "po**sitio**n" everywhere; search `sitioPurok` / `sitio_purok`.
- **Python heredoc `'''` strings**: `\s` inside triggers a SyntaxWarning but is written correctly; `\\s` in a non-raw string becomes `\s` in output. Verify with grep.

### Commands that worked
```bash
# CI + Vercel for a commit (PC, Bash tool)
SHA=$(git rev-parse origin/main)
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/$SHA/check-runs" | python -c "import sys,json; [print(r['name'],r['status'],r['conclusion']) for r in json.load(sys.stdin)['check_runs']]"
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/$SHA/status" | python -c "import sys,json; print(json.load(sys.stdin)['state'])"
# Check-run annotations (the only CI failure detail readable without auth)
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/check-runs/<id>/annotations"
# Deployed-backend probes
curl -s https://smarthealth-hub.japaneast.cloudapp.azure.com/openapi.json | python -c "import sys,json; d=json.load(sys.stdin); print('/api/v1/analytics/appointments/reminder-effect' in d['paths'])"
# Public/protected paths on the website
for p in /register /intake /verify /dashboard; do curl -s -o /dev/null -w "$p %{http_code} %{redirect_url}\n" https://smarthealth-hub-two.vercel.app$p; done
# Test DB (Docker Desktop running)
docker run -d --rm --name shh-test-pg -e POSTGRES_USER=shh_test -e POSTGRES_PASSWORD=shh_test -e POSTGRES_DB=smarthealthhub_test -p 127.0.0.1:5499:5432 postgres:18-alpine
docker run -d --rm --name shh-test-redis -p 127.0.0.1:6399:6379 redis:7-alpine
cd backend && DATABASE_URL="postgresql+asyncpg://shh_test:shh_test@127.0.0.1:5499/smarthealthhub_test" REDIS_URL="redis://127.0.0.1:6399/0" python -m pytest -p no:warnings -o addopts="" -q
# mypy as CI (SQLAlchemy 2.1)
MYPYPATH=<scratchpad>/sa21 python -m mypy app --ignore-missing-imports   # 1 known artifact in sa21/sqlalchemy/util/langhelpers.py:466
```

## Timeline (user prompt → outcome)

| # | User said | Outcome |
|---|---|---|
| 1 | Paste prompt (seq 11) + "wait for my go-ahead" | Onboarding; handoff only on branch; PHI_VIEW/VIEW_PHI alert bug found; plan |
| 2 | "go, all defaults" | #55 export audit + PHI alert (526 / 153) |
| 3 | "merged and deployed, check it, and proceed to the next step" | Deploy verified; CI pytest red on merge (flaky, not reproducible); /register + /intake blocked found → #56 (183) |
| 4 | "the #55 all works, and these: …" (all 6 checks) | #56 verified; recommended return-rate as next step |
| 5 | "go" | Data check + sketch + 7 default definitions for reminder effect |
| 6 | "go, all defaults" | #57 reminder effect (550 / 191) |
| 7 | "merged and deployed, check it, and the checks … (all checked and existed) let's move on to the next step." | #58 visit completes appointment + tz fix (558) |
| 8 | "merged and deployed, check it, now, i want you to do these: Resend… make_user… checks…" | #59 resend + unique mobiles (576 / 195); checklist + sitio advice |
| 9 | 3 screenshots + OTP/verify/Analytics/export feedback + "Failed to save visit" | #60: case-number fix, copy box, /verify theme, camera picker, Analytics (579 / 206) |
| 10 | "yes (code in subject) … i want it like it has a button not chip … I have checked it all, it is all visible now." | #61 code in subject (582); explained no in-email button possible |
| 11 | "/handoff … give me the command to commit and push the new handoff, and the prompt" | This file |

## Quick Start for Next Session

```bash
# Reference docs
cat plans/handoffs/HANDOFF_review-fixes-live_2026-11-22.md
cat CLAUDE.md

# Key files (explore adjacent code too)
backend/app/services/analytics_service.py        # export + reminder effect
backend/app/services/sms_resend_service.py       # resend rules
backend/app/services/appointment_service.py      # complete_appointments_for_visit
backend/app/services/visit_service.py            # create_visit, _next_case_no
backend/app/services/email_service.py            # OTP subject/body
frontend/web/app/(dashboard)/analytics/page.tsx  # Analytics overview
frontend/web/components/dashboard/BhwDashboard.tsx

# Verify current state (PowerShell on PC)
git fetch --prune; git switch main; git pull; git log --oneline -3     # expect ccd12a2 (+ handoff docs merge)
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health
# Full backend suite: see Commands that worked (expect 582 passed)
cd frontend/web; pnpm exec vitest run                                    # expect 206 passed

# Next action
# Ask whether deploy.sh ran after #61; if yes, ask for the Android notification check.
```

## Appendix A: Reminder-effect definitions as approved ("go, all defaults")

Sent as a sketch before building #57; the user approved all seven:
1. **Came** = status `completed`, OR a visit logged for that patient on the appointment's Manila calendar day (reason: completion is a manual button; the 18:00 job marks everything still open as missed and texts the patient).
2. **Got a reminder** = at least one SMS for the appointment with status sent / delivered / replied, created **before** the appointment time; failed/queued texts and the after-miss follow-up don't count; the booking SMS counts.
3. **Which appointments** = already finished (completed, missed, or with a visit that day); cancelled and still-open excluded.
4. **Comparison** = with reminder vs without (booked < 24 h ahead, no mobile, opted out, or the SMS failed).
5. **Small numbers** = a group under 10 shows "Not enough data yet" (counts still shown, e.g. "8 of 9 came").
6. **Extra line** = "N confirmed by replying CONFIRM" (only when > 0).
7. **Where** = BHW + Admin dashboards (last 30 days, counts only) and an Analytics card with a 30 / 90 days switch.
Not in that PR (proposed as its own PR, then built as #58): logging a visit completes the day's appointment.

## Appendix B: Last session's approved recommendation list, final status

| # | Item (from seq 11) | Status now |
|---|---|---|
| 4 | `/analytics/export` for BHW + Physician + Admin | ✅ #55 |
| 5 | One audit row per export | ✅ #55 (`EXPORT_REPORT`) |
| 6 | Drop `chief_complaint` from Admin's visits export | ✅ #55 |
| 7 | Keep admin_staff out of export | ✅ #55 (tested 403, no audit row) |
| 18 | Later: demographics chart / return rate after SMS / Resend failed SMS | demographics: skipped (on Analytics already); return rate ✅ #57; Resend ✅ #59 |
| 19 | Handoff cleanup items | mostly still open (Where We're Going 5); proxy item ✅ #56; utcnow in visit_service ✅ #58 |
| 20 | User checks | OTP email ✅ (screenshot), in-app QR ✅ (camera picker), immunization 10:00 run ❓ |

## Appendix C: `VIEW_PHI` writers (why the alert fix mattered)

`grep 'action="VIEW_PHI"' app` at onboarding: `app/api/v1/endpoints/patients.py` (list_archived_patients ~563, get_patient ~631, patient_summary_pdf ~890), `app/services/medical_history_service.py`, `app/services/patient_service.py`, `app/services/visit_service.py` (get_visit ~373), `app/models/visit.py` (docstring). The only `PHI_VIEW` writer was `health_cards.py` (~2558, full verify). `check_phi_view_burst` matched only `PHI_VIEW` → the alert on the Admin dashboard ("Security alerts") and the hourly `audit.scan_anomalies` task never saw patient/visit/history views. No test covered it before #55. `system_status_service` counts sign-in actions separately (unaffected).

## Appendix D: Design tokens now used across dashboards, Analytics and /verify

| Token | Value | Used for |
|---|---|---|
| ink | `text-[#2a1414]` | headings, numbers |
| muted | `text-[#8a6a6a]` | subtitles, periods |
| card | `rounded-2xl border border-[#eadbd3] bg-white` + soft rose shadow | panels / chart cards |
| inner divider | `border-[#f1e6e0]` | card header rule |
| page (public) | `bg-[#f5efe9]` | /verify background (matches OTP email `_PAGE`) |
| tint | `bg-[#fdf7f3]`, `bg-[#fdf0eb]` | patient block, Period chip |
| primary | `bg-[#b5343e]` hover `#9c2a33` | Export reports, staff sign-in button, 30/90 toggle |
| status | teal (ok), amber (warn/not active), red (fail), sky (info) | `TONE` in `components/dashboard/shared.tsx` |
| headings | `font-display` (DM Serif Display) | page/section titles, big numbers |
Analytics keeps its own local `Section` / `Period` / `ChartCard` / `KpiCard` (not shared with `components/dashboard/shared.tsx`); a later cleanup could unify them.

## Appendix E: Frontend test patterns added this session

- **Async server component**: `render(await VerifyPage({ searchParams: Promise.resolve({ pid, v, sig }) }))` with `vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => body }) as Response))`; `vi.unstubAllGlobals()` in `afterEach`.
- **Page layout tests without charts**: `vi.mock("@/components/charts/…", () => ({ default: () => <div>visits chart</div> }))` and mock the data hooks modules (`@/hooks/useAnalytics`, `@/hooks/useAiAnalytics`) with static data; assert sections with `getByRole("region", { name })` (a `<section aria-labelledby>` with an `h2`) and DOM order with `a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING`.
- **Camera devices**: `Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia, enumerateDevices } })`; fake stream `{ getTracks, getVideoTracks: () => [{ stop, getSettings: () => ({ deviceId }) }] }`; reject once with `new DOMException("not found", "OverconstrainedError")` to test fallback; `window.localStorage.clear()` in `beforeEach`.
- **POST via apiFetch**: route by `(path, options) => options?.method === "POST"`; assert `toHaveBeenCalledWith("/sms/logs/s1/resend", { method: "POST" })`; refusal via `throw new ApiError(msg, 409, "conflict")` → shown in `role="alert"`.
- **Older-backend tolerance**: omit optional fields from fixtures (`reminder_effect`, `can_resend`) and assert the UI hides the feature.
- (Carried) route `apiFetch` by path; mock `@/hooks/useAuth` instead of relying on the module-level user cache; `fireEvent.click` inside `act`.

## Appendix F: OTP email history (so the decision isn't re-litigated)

| When | Subject | Body copy affordance | Why |
|---|---|---|---|
| seq ≤ 10 | "Your SmartHealth Hub sign-in code" (no code, on purpose: lock-screen previews) | digit boxes + small "or copy: 123456" | earlier design |
| #60 | same | digit boxes + dashed "Tap and hold the code below to copy it" box (`user-select:all`, letter-spacing only visual) | user: "no button that can copy the code" |
| #61 | "123456 is your SmartHealth Hub sign-in code" / "… password reset code" | unchanged | user approved code-in-subject to get Android notification "Copy" + Gmail "Copy code"; insists on a one-tap button, which only the phone/Gmail can provide |
Preheader still contains no code (test `test_preview_text_does_not_contain_the_code`). No images/scripts/remote content (test). Codes are never logged in production (tests in `test_otp_not_logged.py`, now 4 incl. the subject one).

## Session Closed
**Closed at:** 2026-11-22 (Manila, UTC+8), after #61 was merged (CI green on `ccd12a2`) and the user asked for this handoff
**Commit:** the `session: review-fixes-live [standalone-9d299342]` commit on branch `docs/handoff-seq12` that includes this note (run by the user from the commands Claude provided; merge via PR, docs only, no server update needed)
**Session status:** Handed off to next session
