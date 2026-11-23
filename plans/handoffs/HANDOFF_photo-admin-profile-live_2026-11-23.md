# Missed-SMS Manila day (#75), phone photo QR + ID scan removed + registration fixes (#76), admins create System Administrators (#77), one Profile & Security page (#78): all merged, deployed and verified; next: user creates the extra admin on the Users page + browser-checks #78, then follow-ups

**Date:** 2026-11-23
**Status:** COMPLETED. #75, #76, #77, #78 merged and deployed; `origin/main` = `131a2c2`; CI 7/7 + Vercel green on every merge. User browser-checked #75/#76 ("all checked and working"). #77 and #78 verified from outside (OpenAPI, probes); **the user's browser check of #78 and the creation of the extra admin account on Users → Add User are not yet reported.**
**Bead(s):** none (`bd` CLI not installed on this PC: `bash: bd: command not found`)
**Epic:** Deploy SmartHealth Hub to production and harden it for the thesis defense (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `17`
**Parent:** `HANDOFF_start-visit-health-qr-live_2026-11-22.md` (seq 16; the session started from its paste prompt)
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > `HANDOFF_nfc-backups-done_2026-11-19.md` > `HANDOFF_phase9-system-health-done_2026-11-19.md` > `HANDOFF_phase10-admin-model-b-done_2026-11-19.md` > `HANDOFF_allergies-media-banner-done_2026-11-20.md` > `HANDOFF_sidebar-and-admin-next_2026-11-20.md` > `HANDOFF_admin-security-settings-done_2026-11-20.md` > `HANDOFF_reliability-done-deploy-pending_2026-11-20.md` > `HANDOFF_signin-hardening-dashboard-next_2026-11-21.md` > `HANDOFF_role-dashboards-live_2026-11-21.md` > `HANDOFF_review-fixes-live_2026-11-22.md` (seq 12) > `HANDOFF_filipino-sms-copy-in-progress_2026-11-22.md` (seq 13, Codex) > `HANDOFF_inactive-patients-live_2026-11-22.md` (seq 14) > `HANDOFF_visit-prefill-clinic-hours-live_2026-11-22.md` (seq 15) > `HANDOFF_start-visit-health-qr-live_2026-11-22.md` (seq 16) > this

> ⚠️ This repo is **PUBLIC**. This file contains no passwords, keys, email
> addresses, phone numbers, patient names/codes, staff names, OTP codes or NFC
> signatures. The new admin account is described generically on purpose.
> Names in tests ("Ana Reyes", "Bea Santos") are invented.

---

## Stale References

Statements in the parent (seq 16) that changed on purpose this session:

- Parent: `reminder_scheduler.py:420` uses `func.date(Appointment.scheduled_at) == today` (UTC) → **fixed in #75**: `manila_day(Appointment.scheduled_at) == manila_today()`. `git grep "func.date(Appointment.scheduled_at)"` on main → 0.
- Parent: `appointment_service._manila_day(column)` → **removed**; one helper `manila_day(column)` in `backend/app/utils/manila_time.py` (also replaced `analytics_service._manila_day` and an inline copy in `visit_service.visit_prefill`). `git grep "_manila_day"` → 0.
- Parent/beat comment: "the SMS step has no 'already sent' check" → **gone**; the job now skips appointments that already have a `post_miss_followup` SMS (`celery_app.py` comment updated).
- Parent test counts "719 passed + 1 skipped / 275" → now **743 / 297** (720 at this session's daytime baseline: the evening test is not skipped in the day).
- Parent: `ProfilePhotoUploader` (Upload/Take Photo tabs, `http://localhost:8000${result.photo_url}`) → **rewritten** in #76 (Phone/Upload file/Webcam tabs; root-relative URLs).
- Parent never mentioned it, but the government-ID scan (`IdScanCard`, `useOcrExtract`, `POST /patients/ocr-extract`, `ocr_service.py`, Tesseract in the image) **no longer exists**.
- Parent: `DEV-WORKFLOW.md` §4 `npm run dev` (line 108) and §7 next migration `0029` (lines 200-206): **still stale** (head `0032`, next `0033`; no migration this session either).

## Since Last Handoff

- **Parent step 1 (merge seq 16 handoff)**: done by the user as **#74** (`347c9ab`) before this session started; verified at onboarding (CI 7/7 + Vercel green).
- **Parent step 2 (#73 browser check)**: user: "#73 all checked and working".
- **Parent step 3 (missed-SMS UTC date, red test first)**: done as **#75**, *with* the "already sent" guard (offered as an option at onboarding; user: "go ahead with the guard included"). Red test confirmed the bug (4 failed / 3 passed).
- **Parent open question 1 ("is the missed-SMS UTC issue real?")**: answered **yes** by the red test (7:30 AM booking today never texted; 7:30 AM tomorrow texted today).
- **Parent step 4 (user picks next: SMS gaps / Archive name / clinic days / docs)**: not reached. The user instead asked for a new feature set (#76: remove ID scan, phone photo QR, PhilHealth validation, registration UI/UX).
- **Parent step 5 (defense items)**: not re-raised this session (user busy with features); still user-only. New item added: the manuscript must not claim OCR ID scanning any more.
- **New at the end**: user asked to add an additional System Administrator account (keep the existing one). The Users page could not create admins; a one-off server command was written and tested locally; then the user asked "can i add it here instead?" (screenshot of Add Staff Account) → chose option 2 ("go with 2, add Admin to the form") → **#77 built** (not yet merged). The server command was NOT run.
- **Extra admin account path changed twice**: server command (tested, never run) → user asked "can i add it here instead?" → **#77** (Admin in Add Staff Account + Edit no longer demotes admins + last-admin guards) → merged/deployed/verified.
- **New request after #77**: "make the profile and security on the same page only … improvise its ui/ux … ensure its backend functionalities are working properly" → **#78** (one Profile & Security page + change-password fixes) → merged/deployed/verified.
- **Trajectory**: same rhythm (build → user merges/deploys → "check it first" → user browser-checks → "all checked and working" → next). Requests are getting larger (one message = 4 features).

## Reference Documents

- `CLAUDE.md`: conventions (Admin model B, audit every write, Alembic-only schema changes, AES-256-GCM fields, module boundaries, **no PHI on NFC/QR**, public-endpoint exceptions).
- `DEV-WORKFLOW.md`: §3 git, §4 local dev (says npm; use pnpm), §5 CI checks + Docker test DB, §6 `deploy.sh`, §7 migrations (number stale), §9 server cheat sheet, §10 backups, §13 agreements.
- `DEPLOY.md`: Vercel env `NEXT_PUBLIC_API_BASE_URL=/api/v1` (line ~160); line 18 no longer mentions Tesseract (#76).
- `docs/SmartHealth_Hub_System_Development_Plan.md` (git-ignored, local): authoritative scope.
- Parent: `plans/handoffs/HANDOFF_start-visit-health-qr-live_2026-11-22.md` (Appendix C manuscript facts; Appendix D browser checks).
- Claude memory (`C:\Users\githu\.claude\projects\c--Users-githu-OneDrive-Documents-smarthealth-hub\memory\`): `local_db_tests.md` (TZ=UTC0), `web_workers_testing.md` (workers = CSV export + QR scan; the removed ID scan was NOT a worker), `deployment_setup.md`.

## The Goal

SmartHealth Hub (thesis: Barangay Health Center records with NFC/QR health cards, SMS reminders, OTP MFA) runs in production for the thesis defense: website `https://smarthealth-hub-two.vercel.app` (Vercel, auto-deploys on merge to `main`), API `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose, deployed by the user with `bash scripts/deploy.sh` **on the server**). This session fixed the missed-appointment SMS (Manila day, never twice), and reworked patient registration: the government-ID OCR scan is gone, the patient photo can be taken with any phone by scanning a QR code (photo appears on the PC by itself), PhilHealth validation follows clear rules, four hidden form bugs that blocked or corrupted registrations are fixed, and the page has a clearer layout. Remaining: confirm the extra admin account, user-only defense items, and small follow-ups the user picks from.

## Where We Are

### Production (verified 2026-11-23 ~14:00 Manila)
- `origin/main` = **`131a2c2`** (merge of #78). Local branch `feat/profile-security-page` (merged). Local `main` force-pointed to `origin/main` at `f947c0d`; run `git switch main; git pull` next session.
- **#78** (`131a2c2`): CI 7/7 + Vercel ✅; production OpenAPI `/api/v1/auth/change-password` responses `['200','401','422','429']`; anonymous POST → 401; Vercel `/settings/security` anonymous → 307 to `/login?next=%2Fsettings%2Fsecurity` (signed-in users get the redirect to `/settings/profile#passkeys`); merged files = the 9 built.
- **#77** (`f947c0d`): CI 7/7 + Vercel ✅; OpenAPI `/api/v1/users/roles` params `['include_admin', 'access_token']`; anonymous `?include_admin=true` → 401; merged files = the 6 built.
- **#76** (`869045d`) checks below.
- CI on `869045d`: pytest ✅, mypy ✅, lint BE ✅, lint FE ✅, tsc ✅, FE build ✅, Docker ✅ (changelog skipped as usual); Vercel ✅.
- CI on `b408352` (#75): all green, Vercel ✅.
- Production OpenAPI after the #76 deploy: `/api/v1/patients/{patient_id}/photo-capture` [post], `/api/v1/patients/{patient_id}/photo-capture/{token}` [get], `/api/v1/photo-capture/{token}` [get, post]; `/api/v1/patients/ocr-extract` **ABSENT**; `PhotoCapturePageResponse` fields exactly `patient_initials, expires_at, uploaded_at`.
- Live probes: public GET unknown token → **404**; staff POST link without login → **401**; Vercel `/photo-capture/not-a-real-token` → **200** (public page); Vercel proxy `/api/v1/photo-capture/<unknown>` → **404**. `/health` ok.
- **User browser checks**: #75 (no browser check possible; job runs 18:00) and #76 → "all checked and working" (registration, PhilHealth, phone QR flow).
- #75 worker check commands were given (git log, `compose ps worker beat`, `grep -c "not_(exists(already_texted))"`); the user said "done" but **did not paste the output**.

### What exists now (by PR)
- **#75 missed-appointment SMS** (`60cb0d0`, merge `b408352`, 8 files +248/−28):
  - `reminder_scheduler._mark_missed_appointments_async` step 2: `today = manila_today()`; filter `manila_day(Appointment.scheduled_at) == today`; `not_(exists(already_texted))` where `already_texted = select(SmsLog.id).where(SmsLog.appointment_id == Appointment.id, SmsLog.sms_metadata["trigger"].astext == _POST_MISS_TRIGGER)` (any status).
  - `_POST_MISS_TRIGGER = "post_miss_followup"` constant (module level, after `_REMINDED_STATUSES`).
  - `app/utils/manila_time.manila_day(column)` = `func.date(func.timezone("Asia/Manila", column))`, used by appointment, analytics, visit services and the job.
- **#76 phone photo + registration** (`0741adb` backend, `24e64e1` frontend, merge `869045d`, 29 files +2624/−2226):
  - Backend: `photo_capture_service` (Redis links), 4 endpoints in `patient_photos.py`, 4 schemas in `schemas/patient_photo.py`, `validate_and_save_photo(..., source=None)` → audit metadata `source`.
  - Backend removal: OCR endpoint, `ocr_service.py` (767 lines), OCR schemas, OCR settings + Azure validator, `pytesseract`, Tesseract apt packages, env-example lines, DEPLOY.md mention.
  - Frontend: new `/patients/new` (stepper, groups, PhilHealth block, chips, consent, sticky nav, step-4 success), new `ProfilePhotoUploader`, public `/photo-capture/[token]`, `lib/photo-capture.ts`, schema helpers, mask fix, profile page photo fix.

### Tests
- Backend full suite under `TZ=UTC0`: **763 passed** (session start 720 at daytime; #75 727; #76 743; #77 754; #78 763).
- Frontend vitest: **308 passed / 45 files** (session start 275 / 40; #76 297/43; #77 301/44; #78 308/45). Lint **0 errors / 77 warnings** (80 before). `tsc --noEmit` clean. `next build` OK.

### Local state (uncommitted on purpose; never commit without asking)
- `README.md` (user's ssh line), `backend/celerybeat-schedule-shm`, `backend/celerybeat-schedule-wal`, `START.md`, `dump.rdb`, `start-tunnel.ps1`. `stash@{0}` ("WIP on main: d041507 …") still present — never drop.
- Docker test containers `shh-test-pg` / `shh-test-redis` were **running** at handoff time (Docker Desktop was restarted twice this session); they are `--rm`, stop with `docker stop shh-test-pg shh-test-redis`.
- This handoff: untracked until the user runs the close commands (branch `docs/handoff-seq17`).

## What We Tried (Chronological)

1. **Onboarding** (paste prompt from seq 16). `bd` not installed. `git fetch`: #74 merged (`347c9ab`), CI 7/7 + Vercel green, `/health` ok. Read `reminder_scheduler.py` 1-60, 180-240, 340-520 (job + task), `celery_app.py` beat (18:00 `nowfun=manila_now`, comment "the SMS step has no already sent check"), `app/utils/manila_time.py` (only Python helpers then), `test_patient_deactivation.py` (job test built on `start_of_utc_day`). Grep of workers: no other UTC day comparisons (`report_tasks.py` already uses Manila). Offered the guard as an option; waited.
2. **User: "#73 all checked and working, go ahead with the guard included"**. Branch `fix/missed-sms-manila-day` from `origin/main`. Docker Desktop was off → `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`, engine ready in ~4 s; containers up; `SHOW timezone` → `UTC`. Baseline **720 passed** (168.9 s).
3. **#75 red test** `tests/test_missed_followup_sms.py` (7). The clock is pinned by patching `app.workers.reminder_scheduler.datetime` with `_JobClock(datetime)` whose `now(tz)` returns `JOB_TIME = 2030-03-04 18:00 Manila` (10:00 UTC). Reason: with the real clock, UTC and Manila dates differ 00:00-08:00 Manila, so the bug hides or moves. Red: **4 failed / 3 passed** (`0 == 1` early-morning not texted; `1 == 0` tomorrow 7:30 texted; `2 == 1` second run; `2 == 1` failed follow-up re-sent).
4. **#75 fix**: `manila_day` moved to utils (3 copies consolidated), job uses `manila_today()` + `manila_day` + NOT EXISTS guard; beat comment updated; old deactivation test now uses `start_of_manila_day`. `ruff format` reflowed an unrelated `parametrize` line in `test_patient_deactivation.py` → reverted (CI runs `ruff check/format --check backend/app` only, see `.github/workflows/ci.yml:20-21`). Related suites **86 passed**; new file under `TZ=Asia/Manila` **7 passed**; full **727 passed** (166.8 s).
5. **User ran `bash script/deploy.sh`** → "No such file" → typo (`scripts/`). Checked #75 merged (`b408352`), CI partly running. User: "merged and deployed, check it first" → CI/Vercel green; cannot see worker code from outside (no API change) → gave 3 server commands; user said "done" with the next request, no output pasted.
6. **User's new request** (2 screenshots: error "philhealthCategory: Invalid enum value. Expected 'indigent' | … received ''" with Member type None; step-4 photo panel with "Start Camera"): remove "Scan Government ID (optional)" and its functions; photo via phone QR that shows on the patient photo; fix PhilHealth validation; fix UI/UX. Exploration found: production `NEXT_PUBLIC_API_BASE_URL=/api/v1` (DEPLOY.md:160, DEV-WORKFLOW.md:244), `apiFetch` uses relative `/api/v1` in the browser, uploader showed `http://localhost:8000${photo_url}` (broken outside dev), webcam stream attached before `<video>` mounted, `Settings` `extra="ignore"` (leftover OCR env vars safe), OCR only in `ocr_service` (not a web worker).
7. **#76 backend TDD**: branch `feat/phone-photo-capture` from `b408352`. `tests/test_photo_capture.py` (16) red **15 failed / 1 passed** (the pass: unknown patient → 404 because the route did not exist). Implemented service + endpoints + schemas + audit `source`. OCR removal hit two Windows gotchas (below). ruff/format/mypy clean; `test_photo_capture` + `test_media_access` **25 passed**; full **743 passed** (175.7 s).
8. **#76 frontend**: loaded `frontend-design:frontend-design` skill (stay in the warm clinical editorial theme; signature: ID-photo crop marks + scan-frame QR + "waiting for phone" pulse; phone page viewfinder + big shutter). Wrote `RegisterPatientPage.test.tsx` first → against the old page **all 6 failed**, and a debug run showed the old page **could not leave step 1** with Blood Type empty (`bloodType: Invalid enum value … received ''`). Same root cause as the PhilHealth screenshot.
9. **Schema fixes**: `optionalChoice()` (z.preprocess "" → undefined) for `bloodType`, `philhealthMemberType`, `philhealthCategory`; then the next run showed **"Baseline Height: Expected number, received nan"** (empty number inputs with `valueAsNumber`) → `optionalNumber()` for `heightCm`, `weightKg`, `gravida`, `para` with readable messages. Then the dependent test failed: the **PhilHealth mask** produced `12-3456789012-` from `12-345678901-2` (second hyphen at index 13 instead of 12) → fixed in `hooks/useInputMasks.ts`; `tests/hooks/useInputMasks.test.ts` (8 cases) red **4 failed** on the old mask.
10. **Photo panel + phone page tests** (`PhotoCapture.test.tsx`, 6): polling never fired → (a) `window.setInterval` in jsdom is not replaced by vitest fake timers → use global `setInterval`/`clearInterval`/`setTimeout`; (b) the polling effect registers after the QR is visible → tests `await waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0))` before `advanceTimersByTime(3100)`. Red vs old uploader: **4 failed** (all panel tests).
11. **tsc fixes**: "None" as `null` clashed with `PatientCreatePayload` → use `undefined`; `zodResolver(patientRegistrationSchema)` typed input `unknown` (preprocess) → `as Resolver<PatientCreateFormValues>` with a comment; Edit Patient page error `string` vs `"member" | "dependent"` → `optionalChoice<const T extends readonly [string, ...string[]]>` keeps literal types. Lint error rules-of-hooks in the mask test → `renderHook`. Full **297 passed**, build OK.
12. **Commit split**: `git rm` had staged the two frontend deletions, which would have landed in the backend commit → `git restore --staged` them before giving commands. User committed/pushed/merged (#76) and asked "is this right? `bash scripts/deploy.sh`" → verified #76 merged first → yes. After deploy: CI 7/7, OpenAPI, probes, file list (29) all verified. User: "all checked and working".
13. **Extra admin account** (end of session): user asked to add a System Administrator account (email + password given in chat; keep the existing admin). Found: `GET /users/roles` returns non-admin roles only ("admin accounts are created only via the seed script"); the Users page cannot create admins. `user_service.create_user` accepts any role, hashes with Argon2id, checks email + mobile uniqueness, writes a CREATE audit row, and **by default SMS-es the password** (`send_welcome_sms=True`). Wrote `scratchpad/add_admin.py` (prompts for full name, mobile, hidden password twice; `send_welcome_sms=False`; creator = oldest active admin for the audit row; refuses if the email exists). Local test: Docker Desktop had died again (restarted); first run **hung** because Windows `getpass` reads the console, not stdin → wrapper `scratchpad/run_with_stdin.py` → test **passed** (created role admin, active, MFA on; password verifies; old admin intact; users 2; audit `[('CREATE','admin','password')]`; rerun "already exists. Nothing changed."; mismatched passwords "Nothing changed."). Test tables dropped afterwards.

## #78 Profile & Security one page (`1cf5b0b` backend, `141d52a` frontend, merge `131a2c2`, deployed, verified)

- User: "merged and deployed, check it first and make the profile and security on the same page only. and improvise its ui/ux design but ensure its backend functionalities are working properly." (links `/settings/profile`, `/settings/security`).
- Backend `POST /auth/change-password` (`auth_service.change_password`, endpoint in `auth.py`): wrong current password **422** "Current password is incorrect." (was 401 → frontend refresh/retry and sign-out on refresh failure); passkey-only (no `password_hash`) 422 "This account signs in with a passkey and has no password to change."; same password 422 "Choose a new password that is different from the current one."; rate limit `change_password:{user_id}` 5 / 900 s → 429. Rules (8+, uppercase, digit) and `PASSWORD_CHANGED` audit unchanged.
- Frontend: `/settings/profile` rewritten ("Profile & Security": identity card with initials avatar + role written out, Account details, Sign-in protection summary, Password section with show/hide + live rules + inline current-password error, Passkeys section with on-page name input instead of `window.prompt`, remove with AlertDialog); `/settings/security/page.tsx` = server `redirect("/settings/profile#passkeys")`; `lib/navigation.ts` Account group = one item "Profile & Security"; `hooks/useAuth.ts` `CurrentUser` gains optional `mobile_number, mfa_enabled, has_password, last_login_at, created_at`.
- Tests: `backend/tests/test_change_password.py` (9; red 4 failed / 5 passed), `frontend/web/tests/components/ProfileSecurityPage.test.tsx` (7) + `tests/lib/navigation.test.ts` ACCOUNT = ["Profile & Security"]; red on old pages 12 failed. Full: backend **763 passed** (387 s, Docker slow), frontend **308 / 45 files**, tsc clean, lint 0 errors / 77 warnings, build OK.
- Scratchpad: `commit-profile-backend.txt`, `commit-profile-frontend.txt`, `pr-body-profile-security.md`.

## #77 admins create System Administrators (`9f13df9` backend, `3c9d4c2` frontend, merge `f947c0d`, deployed, verified)

- Branch `feat/admin-from-users-form` from `869045d`. Commit files in scratchpad: `commit-admin-backend.txt`, `commit-admin-frontend.txt`, `pr-body-admin-accounts.md`.
- Backend: `GET /users/roles?include_admin=true` (admin only, else 403 `ForbiddenError`); default unchanged (no admin). `user_service.update_user` guards before any change → 409 `ConflictError`: own role change ("You cannot change your own role. Ask another System Administrator."), own deactivation ("You cannot deactivate your own account."), last active admin role change/deactivation ("This is the last active System Administrator. Add or activate another administrator first."); helper `_is_last_active_admin(db, user)`. `POST /users` already accepted the admin role (no change).
- Frontend: `CreateUserModal` fetches `/users/roles?include_admin=true`, `orderRoles()` puts admin last, default = first staff role, label "System Administrator (Admin)", amber `role="note"` "Full system access: …" when chosen; seed-script note removed. `EditUserModal`: admin role read-only ("An administrator's role is not changed here."), never sends `role_id` for admins; unknown role → `roleId = ""` + "Keep current role" option.
- **Bug found**: Edit form demoted any admin on save (role list without admin → `setRoleId(data[0].id)` → Admin Staff sent).
- Tests: `backend/tests/test_admin_accounts.py` (11; red 7 failed / 4 passed), `frontend/web/tests/components/AdminAccounts.test.tsx` (4; red 3 failed / 1 passed). Full: backend **754 passed**, frontend **301 / 44 files**, tsc clean, lint 0 errors / 77 warnings, build OK.
- Caveat: Add form always sends the welcome SMS (password included in password mode) — existing behaviour for all roles.

## What We Tried (end of session, after the first handoff draft)

14. **User: "can i add it here instead?"** (screenshot: Add Staff Account with the new admin's email typed, Role "Admin Staff", note "Admin accounts can only be created via the seed script") → explained it would create Admin Staff, told them to Cancel; offered (1) server command or (2) code change. **User: "go with 2, add Admin to the form"** → #77. While reading `EditUserModal` found the demotion bug (`setRoleId(data[0].id)` when the role isn't in the non-admin list → Admin Staff sent on save). The first last-admin API test was impossible (an inactive acting admin cannot authenticate: `security.py:500`) → split into self-rules via the API + the last-admin rule via the service.
15. **User: "merged and deployed, check it first and make the profile and security on the same page only…"** → verified #77, then built #78. Found: the page checked only length (backend needs uppercase + digit); wrong current password = 401 (→ `apiFetch` refresh/retry, sign-out if the refresh fails); passkey-only users were shown an impossible form; `window.prompt` for passkey names; `/users/me` already returned `has_password`, `mfa_enabled`, `last_login_at`, `mobile_number`, `created_at` but the TS type omitted them. Page tests mock `@/hooks/useAuth` (the hook has a module-level cache that would leak between tests).
16. **User: "merged and deployed, check it, and /handoff and close this session"** → #78 verified; this update.

## Key Decisions

- **#77: Admin only in the Add form** (`?include_admin=true`, admin-only), never in Edit (no promotion/demotion through Edit). Admin listed last and never pre-selected; amber "Full system access" note.
- **#77: guards in the service, before any change**: own role change, own deactivation, last active admin (role change or deactivation) → 409.
- **#78: wrong current password → 422, not 401** (401 means "not signed in" to the frontend). Rate limit 5 / 15 min per account. Same password refused.
- **#78: `/settings/security` kept as a server redirect** (`/settings/profile#passkeys`) so bookmarks and old links work; the sidebar has one link.
- **#78: name/email/mobile stay admin-managed** (the page says "ask a System Administrator"); no self-edit endpoint was added.

- **Guard = any existing `post_miss_followup` SMS, any status** (queued/sent/failed/delivered/replied). A failed one is left to the existing staff **Resend** (which copies the metadata, so a resend also counts). Rejected: retrying failed ones like immunization reminders (`_REMINDED_STATUSES`), because a "failed" status can be a false failure and the job may run twice a day only by manual run/retry.
- **One SQL helper `manila_day`** in `app/utils/manila_time.py` instead of a 4th copy. Behaviour of the three existing callers unchanged (identical expression).
- **Phone link in Redis, not a DB table**: no migration, auto-expiry (TTL 15 min = `LINK_LIFETIME`), value = ids + times only (`patient_id`, `created_by_id`, `expires_at`, `uploaded_at`, `photo_url`). Token `secrets.token_urlsafe(32)`.
- **Link lifetime 15 min, one patient, upload-only, retakes allowed (≤10 per link)**; staff "New QR code" makes another. Phone page shows **initials only** ("A. R."), not name/code (minimum PHI on a public page). Chosen as defaults; told the user they can change them.
- **Audit**: each phone upload = `UPDATE patient` by the link creator, metadata `changed_fields=["photo_path"]`, `source="phone_capture"`. Link creation is not audited (no PHI; same as intake tokens).
- **Public endpoints** `GET/POST /photo-capture/{token}` (like `/intake/{token}`); added `/photo-capture` to `lib/public-paths.ts` PUBLIC_PAGES; `proxy.ts` comment updated.
- **Profile page does NOT auto-create a link** (only "Show QR code"): avoids a Redis key + rate-limit hit (30 links / 10 min / user) on every profile view. Registration step 4 auto-creates (`autoStartPhone`), with a `useRef` guard against React dev double effects.
- **Client-side shrink** to 1280 px JPEG (q 0.88) before any upload (`shrinkPhoto`, falls back to the original file): phone photos are 3-8 MB, server max 5 MiB (`MAX_PHOTO_UPLOAD_BYTES`), and Vercel→Azure rewrite body limits.
- **Root-relative photo URLs everywhere** (same origin through the Next.js rewrite, so the httpOnly cookie goes with `<img>`); removed `NEXT_PUBLIC_API_BASE_URL` origin math from the profile page.
- **PhilHealth rules only in the registration form** (`patientRegistrationSchema = patientCreateSchema.superRefine(philhealthIssues)`); `patientCreateSchema` stays a ZodObject because edit/intake schemas use `.pick/.extend`. Backend and Edit Patient unchanged so older records with other formats still save.
- **OCR removed fully** (frontend, backend, Docker image) as asked ("and its functionalities"); `registration_data_source` literal keeps `'ocr'` for older records.
- **Extra admin via a one-off `docker compose exec backend python -c …`** using `user_service.create_user` (not raw SQL, not a new repo script): proper hashing, uniqueness checks, audit row; password typed hidden (not in shell history); welcome SMS off. Rejected: changing `GET /users/roles` to allow admin creation in the UI (would change Admin model rules without a request).
- **README line 12 ("OCR-assisted ID scanning") left as is**: the file carries the user's uncommitted ssh line.

## Evidence & Data

### PRs this session
| PR | Branch | Commits | Merge | Files (+/−) |
|---|---|---|---|---|
| #74 | docs/handoff-seq16 | `ef598bf` session handoff seq 16 | `347c9ab` | merged before session |
| #75 | fix/missed-sms-manila-day | `60cb0d0` fix(sms): missed-appointment text uses the Manila day and is sent once | `b408352` | 8 files +248/−28 (built = merged) |
| #78 | feat/profile-security-page | `1cf5b0b` fix(auth): change-password errors are form errors, not 401; rate limit; `141d52a` feat(account): one Profile & Security page | `131a2c2` | 9 files (3 backend, 6 frontend) |
| #77 | feat/admin-from-users-form | `9f13df9` feat(users): admins can create System Administrator accounts; never lose the last admin; `3c9d4c2` feat(users): "System Administrator (Admin)" in Add Staff Account; Edit keeps an admin's role | `f947c0d` | 6 files (3 backend, 3 frontend) |
| #76 | feat/phone-photo-capture | `0741adb` feat(photos): take the patient photo with a phone (QR link); remove the ID scan; `24e64e1` feat(registration): phone photo QR, PhilHealth rules, no ID scan, new layout | `869045d` | 29 files +2624/−2226 |

### CI per merge commit
| Commit | pytest | mypy | lint BE | lint FE | tsc | FE build | Docker | Vercel |
|---|---|---|---|---|---|---|---|---|
| `347c9ab` (session start) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `b408352` (#75) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `869045d` (#76) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `f947c0d` (#77) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `131a2c2` (#78) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Test count history
| Point | Backend (`TZ=UTC0`) | Frontend | Notes |
|---|---|---|---|
| Session start | 720 (168.9 s) | 275 / 40 files | daytime: evening test not skipped |
| #75 | **727** (166.8 s) | 275 | +7 |
| #76 | **743** (175.7 s) | **297 / 43 files** | +16 / +22 |
| #77 | **754** (172.4 s) | **301 / 44 files** | +11 / +4 |
| #78 | **763** (387.1 s; Docker slow) | **308 / 45 files** | +9 / +7 (navigation test updated) |

### Red → green per change
| Test file | Red on old code | Why red |
|---|---|---|
| `backend/tests/test_missed_followup_sms.py` (7) | 4 failed / 3 passed | 7:30 AM today not texted (`0 == 1`); tomorrow 7:30 texted (`1 == 0`); 2 runs → 2 texts; failed follow-up re-sent |
| `backend/tests/test_photo_capture.py` (16) | 15 failed / 1 passed | routes missing; OCR endpoint still 200 |
| `frontend/web/tests/components/RegisterPatientPage.test.tsx` (6) | 6 failed | ID scan text present; old page stuck at step 1 (bloodType "") |
| `frontend/web/tests/hooks/useInputMasks.test.ts` (8) | 4 failed | full numbers → `12-3456789012-` |
| `frontend/web/tests/components/PhotoCapture.test.tsx` (6, panel part) | 4 failed (all panel tests) | old uploader: no Phone tab, localhost URL |

### New backend tests by file
| File | Count | Covers |
|---|---|---|
| `tests/test_missed_followup_sms.py` | 7 | `TestManilaDay`: 7:30 AM today texted + marked missed; 4 PM today texted; yesterday's missed not texted; tomorrow 7:30 (status set by hand) not texted. `TestNoSecondText`: two runs → 1 SMS and 1/0 `apply_async` calls; an earlier **failed** follow-up blocks a new one; the day-before reminder (`confirmation_token` metadata, delivered) does **not** block |
| `tests/test_photo_capture.py` | 16 | 4 roles make a link (201; `capture_url` = `QR_BASE_URL/photo-capture/{token}`; 14-15 min left); 401 without login; 404 unknown patient; Redis value holds ids only (no name/code/birth year) + TTL 14-15 min; phone page = initials "A. R." and exactly 3 fields; deleted key → 404 on GET/POST and random token 404; upload saves `patient_photos/{id}.jpg`, response has no `photo_url`, 1 audit UPDATE by link creator with `source=phone_capture`; staff status before/after upload (+ phone page `uploaded_at` equal); status 401 without login and 404 under another patient; retake replaces (blue pixel wins); PDF → 422; 11th upload → 429; `ocr-extract` → 404/405 |

### New frontend tests by file
| File | Count | Covers |
|---|---|---|
| `tests/components/RegisterPatientPage.test.tsx` | 6 | no ID scan text; PhilHealth None registers (no category/number, `registrationDataSource` "manual", no "Invalid enum value"); Member without number/category → labelled messages in the alert, no code names; 11-digit number → "must have 12 digits" (summary + field = 2); valid → payload member/indigent/`12-345678901-2`; Dependent needs number only; switching back to None disables + clears both; after save "Ana Reyes is registered" + photo panel (mocked) for `p-1` |
| `tests/components/PhotoCapture.test.tsx` | 6 | panel auto QR (`data:image/png;qr,<capture_url>`), "Waiting for the phone", 1 POST; poll → photo `src` = `/api/v1/patients/p1/photo?v=42`, `onPhotoSaved` called, still 1 POST; profile: no POST until "Show QR code"; 404 poll → "This QR code has expired" → "New QR code" = 2nd POST; Upload file → `fetch("/api/v1/patients/p1/photo", credentials include)`, img src relative, no "localhost"; phone page: initials, `capture="environment"`, preview, POST FormData `photo`, "Photo sent"; expired link → message, no Take photo button |
| `tests/hooks/useInputMasks.test.ts` | 8 | `1`, `12`, `123`→`12-3`, 11 digits → `12-345678901`, 12 digits/with hyphens/with spaces → `12-345678901-2`, 13 digits capped |
| `tests/lib/public-paths.test.ts` | +2 | `/photo-capture/abc123` public; `/photo-capturex` protected |

### Hidden registration bugs found (all on production before #76)
| Field | Old behaviour | Root cause | Fix |
|---|---|---|---|
| PhilHealth Category | "Invalid enum value … received ''" (user's screenshot) | RHF reads `""` from an unselected `<select>`; zod enum rejects | `optionalChoice` preprocess "" → undefined |
| Blood Type | step 1 blocked when left on "— Unknown —" | same | same |
| Baseline Height / Weight, Gravida / Para | "Expected number, received nan" when empty | `valueAsNumber` on empty input = NaN | `optionalNumber` preprocess NaN/"" → undefined |
| PhilHealth No. mask | `12-3456789012-` saved for a full number | second hyphen `slice(0, 13)` instead of `slice(0, 12)` | fixed + 8-case test |
| Photo after upload | `http://localhost:8000/api/v1/...` broken image | hard-coded origin in uploader | root-relative URL |
| Webcam | black preview possible | `srcObject` set while `<video>` not mounted | effect attaches stream when state = active |
| Error list | code names (`philhealthCategory`) | `FIELD_LABELS` covered few fields | labels for every field; entries focus the field |

### Missed-SMS proof (#75)
```
JOB_TIME = 2030-03-04 18:00 Asia/Manila (10:00 UTC)
7:30 AM Manila 2030-03-04 = 2030-03-03 23:30 UTC → old filter func.date() = 2030-03-03 ≠ 2030-03-04 → never texted
7:30 AM Manila 2030-03-05 = 2030-03-04 23:30 UTC → old filter matched "today" → texted a day early (if already 'missed')
```

### Production probes after #76 deploy
| Check | Result |
|---|---|
| `/api/v1/patients/{patient_id}/photo-capture` | `['post']` |
| `/api/v1/patients/{patient_id}/photo-capture/{token}` | `['get']` |
| `/api/v1/photo-capture/{token}` | `['get', 'post']` |
| `/api/v1/patients/ocr-extract` | ABSENT |
| public GET unknown token | 404 |
| staff POST link, no login | 401 |
| Vercel `/photo-capture/x` | 200 (public page) |
| Vercel proxy `/api/v1/photo-capture/<unknown>` | 404 |

### Rate limits (photo links)
| Key | Limit |
|---|---|
| `photo_capture_link:{user_id}` (staff POST) | 30 / 600 s |
| `photo_capture_view:{ip}` (public GET) | 60 / 60 s |
| `photo_capture_upload:{token}` (public POST) | 10 / 900 s (link lifetime) |

### Extra-admin script local test
```
Created: new-admin@example.test | role admin | active True | MFA True
Admin accounts: 1 before, 2 now. No other account was changed.
rerun → "An account with new-admin@example.test already exists. Nothing changed."
mismatch → "Passwords do not match. Nothing changed."
password verifies: True | old admin still there: True | users: 2
audit rows: [('CREATE', 'admin', 'password')]
```

### Design direction (#76, frontend-design skill)
- Stay inside the existing "warm clinical editorial" theme (rose `#b5343e` → `#c94060` gradients, cream cards `border-[#eadbd3]`, DM Serif `font-display` headings, `IconBadge` from `components/dashboard/shared.tsx`).
- Signature elements: ID-photo **crop marks** around the photo frame (176×208) and the QR (176 px, `QRCode.toDataURL(url, {margin: 1, width: 320, color: {dark: "#2a1414"}})`); an emerald **"waiting for the phone" ping** (`motion-reduce:animate-none`); a 2.4 s green ring when a photo arrives.
- Phone page: radial cream background, dark 4:5 viewfinder with white corner marks, 80 px round shutter button, "Choose from gallery" link, sticky-free single column (`max-w-sm`).
- Registration: 4-segment progress stepper with icons and hints (labels hidden below `sm`, "Step N of 4" shown instead), `fieldset/legend` groups ("Name & birth", "Location", "Patient", "Emergency contact", "Guardian", "PhilHealth", "Programs & special groups", "Visit details"), radio pills via `has-[:checked]`, `min-h-11` touch targets, sticky bottom Back/Next bar with blur.

## Code Analysis

- `backend/app/services/photo_capture_service.py`: `LINK_LIFETIME = timedelta(minutes=15)`; key `photo_capture:{token}`; `PhotoCaptureLink(token, patient_id, created_by_id, expires_at, uploaded_at=None, photo_url=None)` (frozen dataclass); `create_link(patient_id, created_by_id)` (SET with `ex`); `get_link(token)` (None if unknown, >128 chars, or past `expires_at`); `mark_uploaded(link, photo_url) -> datetime` (SET `keepttl=True`); `initials(first, last)` → "A. R." or "—".
- `backend/app/api/v1/endpoints/patient_photos.py`: `_LINK_NOT_FOUND` message; `create_photo_capture_link` (201, `get_patient` first → 404, then rate limit, `capture_url = f"{settings.QR_BASE_URL.rstrip('/')}/photo-capture/{token}"`); `get_photo_capture_status` (404 when token's patient ≠ path patient); `get_photo_capture_page` (public); `upload_photo_from_phone` (public; `get_link` → 404 before rate limit; `validate_and_save_photo(updated_by_id=link.created_by_id, source="phone_capture")`; response has no `photo_url`).
- `backend/app/services/patient_photo_service.validate_and_save_photo(db, patient_id, upload, updated_by_id, ip_address=None, source=None) -> str` (root-relative URL); MIME allowlist jpeg/png/webp; `ValidationError` → **422** for non-images; `MAX_PHOTO_UPLOAD_BYTES` (5 MiB).
- `backend/app/workers/reminder_scheduler.py`: `_POST_MISS_TRIGGER`; step 2 imports `exists, not_, select, update` (no `func`); `manila_today(now=None)` uses the module's `datetime` (so the test clock patch covers it).
- `frontend/web/lib/schemas/patient.ts`: `optionalChoice<const T extends readonly [string, ...string[]]>(values)`, `optionalNumber(schema: z.ZodNumber)`, `PHILHEALTH_CATEGORIES` (as const), `PHILHEALTH_NO_RE = /^\d{2}-?\d{9}-?\d$/`, `philhealthIssues(data)` → `[{path, message}]`, `patientRegistrationSchema`. Messages: "PhilHealth No. must have 12 digits (e.g. 12-345678901-2).", "Enter the PhilHealth No. of this member or dependent.", "Choose the PhilHealth category of this member."
- `frontend/web/lib/photo-capture.ts`: `createPhotoLink`, `getPhotoLinkStatus` (via `apiFetch`, refresh-on-401), `uploadPatientPhoto`, `getPhonePage`, `sendPhonePhoto` (raw `fetch` to `/api/v1`, multipart field `photo`, parses `{error:{message}}` or `{detail}`), `PHOTO_MAX_SIDE = 1280`, `shrinkPhoto(blob)`, `manilaClock(iso)`.
- `ProfilePhotoUploader({patientId, currentPhotoUrl?, onPhotoSaved?, autoStartPhone=false})`: tabs `phone | upload | webcam`; `LinkState` none/loading/ready/expired/error; `POLL_MS = 3000`; skips polls when `document.visibilityState === "hidden"`; 404 on status → expired; new `uploaded_at` → `photoSaved(url, "Photo received from the phone.")` (2.4 s green ring).
- `/patients/new/page.tsx`: `STEPS`, `FIELDS_BY_STEP`, `FIELD_LABELS` (all fields), `chooseMemberType(undefined)` clears + `clearErrors` the number/category; payload drops PhilHealth number/category when no member type and 4Ps Household ID when 4Ps unchecked; `registrationDataSource: "manual"` always; step 4 `created = {id, name, code}`.

## Files Changed

### #75 backend
- `backend/app/utils/manila_time.py` — `manila_day()` (LF file).
- `backend/app/services/appointment_service.py`, `analytics_service.py`, `visit_service.py` — use `manila_day` (CRLF).
- `backend/app/workers/reminder_scheduler.py` — Manila day + guard + `_POST_MISS_TRIGGER` (CRLF).
- `backend/app/workers/celery_app.py` — beat comment (CRLF).
- `backend/tests/test_missed_followup_sms.py` (new, 7), `backend/tests/test_patient_deactivation.py` (Manila day start).

### #76 backend
- `backend/app/services/photo_capture_service.py` (new), `backend/app/api/v1/endpoints/patient_photos.py`, `backend/app/schemas/patient_photo.py`, `backend/app/services/patient_photo_service.py`.
- Removed: `backend/app/services/ocr_service.py`; OCR block in `backend/app/api/v1/endpoints/patients.py` (+ imports `File`, `UploadFile`, `OcrExtractResponse`, `OcrFieldValue`); OCR schemas in `backend/app/schemas/patient.py`; OCR settings + `validate_azure_ocr_config` in `backend/app/core/config.py`; `pytesseract` in `backend/pyproject.toml`; `tesseract-ocr*` in `backend/Dockerfile`; OCR lines in `.env.server.example`, `backend/.env.example`; Tesseract in `DEPLOY.md:18`.
- `backend/tests/test_photo_capture.py` (new, 16).

### #76 frontend
- `frontend/web/app/(dashboard)/patients/new/page.tsx` (rewritten), `.../_components/ProfilePhotoUploader.tsx` (rewritten), `.../[patientId]/page.tsx` (photo URL + placeholder), `frontend/web/app/photo-capture/[token]/page.tsx` (new), `frontend/web/lib/photo-capture.ts` (new), `frontend/web/lib/schemas/patient.ts`, `frontend/web/hooks/useInputMasks.ts`, `frontend/web/lib/public-paths.ts`, `frontend/web/proxy.ts` (comment).
- Removed: `frontend/web/components/forms/IdScanCard.tsx`, `frontend/web/hooks/useOcrExtract.ts`.
- Tests: `tests/components/RegisterPatientPage.test.tsx` (6), `tests/components/PhotoCapture.test.tsx` (6), `tests/hooks/useInputMasks.test.ts` (8), `tests/lib/public-paths.test.ts` (+2).

### Scratchpad (session-only, will be lost: `C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\0b825eec-d3fe-48e3-95f5-1f392b3a99d7\scratchpad\`)
`commit-missed-sms.txt`, `pr-body-missed-sms.md`, `commit-photo-backend.txt`, `commit-photo-frontend.txt`, `pr-body-phone-photo.md`, `mine-photo/` (red-proof copies), `add_admin.py` (one-off admin creation; email passed as argv, nothing secret inside), `run_with_stdin.py` (local test wrapper only), `commit-handoff-seq17.txt` (close step).

## User Feedback & Preferences (REQUIRED)

- "#73 all checked and working, go ahead with the guard included" → accepts recommended options; short confirmations.
- `bash script/deploy.sh` → "No such file" (typo) — always spell the full command `bash scripts/deploy.sh` and say where (server prompt).
- "merged and deployed, check it first" (again) → verify CI, Vercel, OpenAPI, probes, merged-vs-built files **before** anything else.
- "done, now, can you please remove the upload (Scan Government ID (optional)) … and its functionalities" → remove features completely (frontend + backend), not just hide.
- "i want it to be there's an qr i can scan on my phone then when i took a photo, that image will be visible on the patient photo" → phone-first photo capture; it must appear on the PC without extra clicks.
- "correct the validation for the philhealth and fix the ui/ux" → cares about clear validation messages and polished UI (screenshots of raw zod errors).
- "can i add it here instead?" (screenshot of Add Staff Account) → prefers doing admin work in the app UI over server commands.
- "go with 2, add Admin to the form" → accepts a code change over a one-off script when it makes the app self-service.
- "merged and deployed, check it first and make the profile and security on the same page only. and improvise its ui/ux design but ensure its backend functionalities are working properly." → wants merged pages, polished UI **and** verified backend behaviour.
- "merged and deployed, check it, and /handoff and close this session and provide the prompt i can use on the fresh session."
- "is this right? azureuser@smarthealth-server:/opt/smarthealth-hub$ bash scripts/deploy.sh" → wants confirmation before running server commands; check merge state first.
- "all checked and working, /handoff and before closing this session add this email to access the System Administrator account … do not remove the another existing account for system ad" → keep the existing admin; wants a second admin login for another person. Gave the password in chat (weak-ish, name-based) → recommend changing it after first login.
- Selects whole PR bodies in the IDE (ide_selection of `pr-body-*.md`) → PR bodies must stand alone and be paste-ready.
- (Carried) user commits/pushes/merges/deploys; `git commit -F <file>`; pnpm not npm; never open `.env`; say "on the server (prompt `azureuser@smarthealth-server`)"; repo public, no PHI; name the account/role for every browser check; the Azure VM shuts down at 12 AM.

## Where We're Going

1. **START HERE: merge this handoff** (branch `docs/handoff-seq17`, docs only, no deploy). Then `git switch main; git pull` (expect `131a2c2` + the handoff merge).
2. **Ask for the two pending user checks** (all PRs are already merged, deployed and verified from outside):
   - **#78 browser check (any account, e.g. BHW)**: the sidebar shows one "Profile & Security" link; `/settings/security` lands on Passkeys; a wrong current password → error under the field and still signed in; change the password → sign in again with the new one; add a passkey with a typed name and remove it.
   - **Extra System Administrator**: Admin account → **Users → Add User** → role **System Administrator (Admin)** → Set Password → Create Account. Check the Admin badge; Edit + save keeps Admin; the sign-in code goes to the new admin's email; advise changing the password after first login (it was typed in chat). The welcome SMS includes the password (existing behaviour) — mention it before they create the account. Do **not** change or remove the existing admin. (Appendix C server command = fallback only.)
3. **Optional confirmation of #75 on the server**: `docker compose -f docker-compose.server.yml --env-file .env.server exec worker grep -c "not_(exists(already_texted))" app/workers/reminder_scheduler.py` → `1`. Real-world check: a 7:00-7:30 AM booking left unseen → one missed SMS after 18:00 (SMS Logs, Admin or BHW).
4. **Then let the user pick** (numbered list): (a) removed-patient SMS gaps — manual "Send SMS" (`backend/app/api/v1/endpoints/sms.py` ~199) still allows archived patients; STOP opt-out lookup (~622) only matches active patients; (b) Archive page "Archived by" shows a UUID (`frontend/web/app/(dashboard)/patients/archived/page.tsx:286`) → name; (c) clinic days (weekends/holidays); (d) docs: `DEV-WORKFLOW.md` §4 `pnpm dev`, §7 next migration `0033`, `TZ=UTC0` in §5, README line 12 (OCR) — needs the user's OK because README has their uncommitted line; (e) Edit Patient: same `""`/NaN and PhilHealth rules as registration (not checked this session).
5. **Defense items (user-only, remind once)**: manuscript wording — add phone photo QR, PhilHealth rules, missed-SMS once per appointment; **remove any OCR/ID-scan claims**; gateway SIM load + test SMS; final NTAG215 for the demo patient; reprint pre-#50 cards.

## Risks & Blockers

- **iPhone HEIC photos**: the phone page uses `accept="image/*"`; Safari usually converts to JPEG on upload, and `shrinkPhoto` re-encodes to JPEG when `createImageBitmap` can decode. If decoding fails, the original file is sent and the backend accepts only jpeg/png/webp (422 "Unsupported file type"). Not tested on an iPhone.
- **Vercel deploys before the backend**: any future change to these endpoints shows "Try again" on the Phone tab until `deploy.sh` runs.
- **Polling cost**: one status GET every 3 s per open panel (≤300 per 15-minute link); skipped when the tab is hidden.
- **Redis restart** drops open photo links (staff press "New QR code"); no data loss.
- **Extra admin account not confirmed**; the given password is weak-ish and was typed into chat.
- (Carried) Docker Desktop on the PC stops by itself (twice this session) → `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`; Azure VM shuts down at 12 AM; gateway SIM has no load; CI logs unreadable by Claude.

## Open Questions

1. Was the extra System Administrator created on Users → Add User, and does its sign-in work? Was #78 browser-checked?
6. Should the Add Staff Account form get a "send welcome SMS" switch (today it always texts the password in password mode)?
2. Should the 15-minute / initials-only / 10-uploads defaults for phone photo links change?
3. Which follow-up next (SMS gaps, Archive name, clinic days, docs, Edit Patient form bugs)?
4. (Carried) Weekends/holidays closed? Are 7:00 AM–5:00 PM the real hours?
5. (Carried) `AGENTS.md` for Codex sessions?

## Tooling Gotchas (cost time this session)

- **Python `open()` on Windows defaults to cp1252**: marker strings with "──" or "—" did not match → always `open(p, newline="", encoding="utf-8")` in edit scripts.
- **`backend/Dockerfile` has mixed line endings** (most CRLF, the apt list lines LF) → `sed` patterns with `\r` or the CRLF-joined Python replace silently missed; a bytes-level line filter worked.
- **`git rm` stages deletions immediately** → when splitting backend/frontend commits, `git restore --staged <frontend paths>` before giving the backend `git add` command.
- **vitest fake timers + jsdom**: `window.setInterval` is not faked; use the global `setInterval`. Wait for the timer to exist (`vi.getTimerCount()`) before advancing.
- **zod preprocess + zodResolver**: input type becomes `unknown` → cast `as Resolver<FormValues>`; generic enum helpers need `const` type parameters to keep literal types.
- **React Hook Form uncontrolled `<select>` / number inputs**: an unselected select yields `""`, an empty number input with `valueAsNumber` yields `NaN` — schemas must treat both as "not given".
- **Windows `getpass` ignores piped stdin** (reads the console) → a local test of an interactive script hangs; wrap with a stdin-reading `getpass` replacement.
- **`ruff format` on tests** may reflow unrelated lines; CI only checks `backend/app`.
- **Finding why a page test does not advance**: copy the test with `sed` replacing the failing `waitFor` by `console.log("ALERT>>", screen.queryByRole("alert")?.textContent)` and run it with `-t "<name>"`; this exposed the bloodType `""`, height `NaN` and mask bugs in minutes. Delete the `_dbg` file after.
- **Red proofs for pages**: copy new files to `scratchpad/mine-photo/`, `git show HEAD:<path> > <path>`, run vitest, copy back, `git diff --stat` to confirm restore (done for `useInputMasks.ts` + `ProfilePhotoUploader.tsx`).
- **lucide-react 1.27**: checked icons exist before use (`MapPinHouse`, `CalendarPlus`, `CreditCard`, `UserPlus`, `ShieldCheck`, `HeartPulse`, `IdCard`, `Smartphone`, `QrCode`, `Hourglass`, `LoaderCircle`, `CircleCheck`, `TriangleAlert`, `ImagePlus`, `UserRound`, `RotateCcw`, `Send` all exist).
- **Library versions**: zod 3.23.8, @hookform/resolvers 3.3.4, react-hook-form 7.84.0, next 16.2.10, react 19.2.7, qrcode 1.5.4.
- (Carried) API JSON is snake_case; CRLF files → Edit tool; Vercel pages need sign-in (307); `deploy.sh` runs on the server only.

### Commands that worked
```bash
# CI + Vercel for main (PC, Bash tool)
SHA=$(git rev-parse origin/main)
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/$SHA/check-runs" | python -c "import sys,json; [print(r['name'],'|',r['status'],r['conclusion']) for r in json.load(sys.stdin)['check_runs']]"
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/$SHA/status" | python -c "import sys,json; d=json.load(sys.stdin); print(d['state'])"
# Routes live?
curl -s https://smarthealth-hub.japaneast.cloudapp.azure.com/openapi.json | python -c "import sys,json; p=json.load(sys.stdin)['paths']; print('/api/v1/photo-capture/{token}' in p, '/api/v1/patients/ocr-extract' in p)"
# Test DB + full suite as the server (Bash, backend/)
docker run -d --rm --name shh-test-pg -e POSTGRES_USER=shh_test -e POSTGRES_PASSWORD=shh_test -e POSTGRES_DB=smarthealthhub_test -p 127.0.0.1:5499:5432 postgres:18-alpine
docker run -d --rm --name shh-test-redis -p 127.0.0.1:6399:6379 redis:7-alpine
TZ=UTC0 DATABASE_URL="postgresql+asyncpg://shh_test:shh_test@127.0.0.1:5499/smarthealthhub_test" REDIS_URL="redis://127.0.0.1:6399/0" python -m pytest -p no:warnings -o addopts="" -q
python -m ruff check app; python -m ruff format --check app; python -m mypy app
# Frontend (frontend/web)
pnpm exec tsc --noEmit; pnpm run lint; pnpm run test; pnpm run build; git checkout -- next-env.d.ts
# Server (prompt azureuser@smarthealth-server, from /opt/smarthealth-hub)
bash scripts/deploy.sh
```

## Timeline (user prompt → outcome)

| # | User said | Outcome |
|---|---|---|
| 1 | Paste prompt (seq 16) | Onboarding; #74 merged; proposed missed-SMS fix + guard option; waited |
| 2 | "#73 all checked and working, go ahead with the guard included" | Built #75 (727) |
| 3 | `bash script/deploy.sh` → no such file | Typo → `scripts/`; #75 merged |
| 4 | "merged and deployed, check it first" | CI/Vercel green; gave worker check commands |
| 5 | "done, now … remove … Scan Government ID … qr i can scan on my phone … philhealth … ui/ux" (+2 screenshots) | Built #76 (743 / 297); found 4 extra form bugs |
| 6 | "is this right? … bash scripts/deploy.sh" | Verified #76 merged → yes |
| 7 | "I have merged and deployed, check it" | CI 7/7, Vercel, OpenAPI, probes, 29 files verified |
| 8 | "all checked and working, /handoff … add this email … System Administrator … do not remove the another existing account" | Admin command written + tested locally; first handoff draft |
| 9 | "can i add it here instead?" (screenshot) | Explained: the form makes Admin Staff only; offered 2 options |
| 10 | "go with 2, add Admin to the form" | Built #77 (754 / 301) |
| 11 | "merged and deployed, check it first and make the profile and security on the same page only…" | Verified #77; built #78 (763 / 308) |
| 12 | "merged and deployed, check it, and /handoff and close this session…" | Verified #78; this file updated and closed |

## Quick Start for Next Session

```bash
# Reference docs
cat plans/handoffs/HANDOFF_photo-admin-profile-live_2026-11-23.md
cat CLAUDE.md
cat DEV-WORKFLOW.md   # §4 says npm (use pnpm), §7 migration number stale (next 0033)

# Key files (explore adjacent code too)
backend/app/services/photo_capture_service.py
backend/app/api/v1/endpoints/patient_photos.py
backend/app/workers/reminder_scheduler.py        # _mark_missed_appointments_async
frontend/web/app/(dashboard)/patients/new/page.tsx
frontend/web/app/(dashboard)/patients/_components/ProfilePhotoUploader.tsx
frontend/web/lib/schemas/patient.ts              # optionalChoice / optionalNumber / philhealthIssues

# Verify current state (PowerShell on PC)
git fetch --prune; git switch main; git pull; git log --oneline -3     # expect 131a2c2 (+ handoff merge)
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health
# Backend: TZ=UTC0 full suite → expect 763 passed; frontend: pnpm run test → 308 / 45 files

# Next action
# Confirm handoff PR merged; ask for the #78 browser check and whether the extra System Administrator was created on Users → Add User; then offer the follow-up list (Where We're Going step 4).
```

## Appendix A: API changes this session (as of `131a2c2`)

| Method + path | Roles | Change | Notes |
|---|---|---|---|
| `POST /api/v1/patients/{id}/photo-capture` | bhw, physician, admin_staff, admin | **new** → 201 `{token, capture_url, expires_at}` | 404 unknown patient; 30/10 min/user |
| `GET /api/v1/patients/{id}/photo-capture/{token}` | same | **new** → `{expires_at, uploaded_at, photo_url}` | 404 expired or other patient's token |
| `GET /api/v1/photo-capture/{token}` | public | **new** → `{patient_initials, expires_at, uploaded_at}` | 60/min/IP |
| `POST /api/v1/photo-capture/{token}` | public | **new**, multipart `photo` → `{message, uploaded_at}` | 10 per link; audit UPDATE by link creator |
| `POST /api/v1/patients/ocr-extract` | — | **removed** | 404/405 now |
| `GET /api/v1/users/roles?include_admin=true` | admin only (403 others) | **new query param** (#77) | default list unchanged (no admin) |
| `PUT /api/v1/users/{id}` | admin | 409 for own role change, own deactivation, last active admin (#77) | checked before any change |
| `POST /api/v1/auth/change-password` | signed in | wrong current → **422** (was 401); passkey-only → 422; same password → 422; 5 per 15 min → 429 (#78) | rules + audit unchanged |
| Celery `workers.mark_missed_appointments` | — | Manila day; one follow-up per appointment | no API change |

## Appendix B: Exact UI strings added this session

| Where | Text |
|---|---|
| Photo panel header | "Patient photo" / "Shown on the profile and printed on the health card." |
| Photo frame | "No photo yet"; "Photo on file. A new one replaces it."; "Head and shoulders, plain background."; "Photo updated" |
| Tabs | "Phone", "Upload file", "Webcam" |
| Phone tab (profile, before) | "Take the photo with a phone: show a QR code, scan it, and the photo appears here." + "Show QR code" |
| Phone tab (ready) | steps "Open the camera on any phone and scan this code." / "Take the patient's photo and tap Send." / "It appears here by itself. Retake on the phone if needed."; "Waiting for the phone · works until {time}"; "New QR code" |
| Phone tab (expired) | "This QR code has expired (15 minutes). Make a new one to take another photo." |
| Toasts | "Photo received from the phone." / "Photo saved." |
| Upload tab | "Choose a photo or drop it here" / "JPEG, PNG or WebP. Large photos are made smaller before upload." / "Save photo" / "Choose another" |
| Webcam | "Start webcam", "Take photo", "Use this photo", "Retake"; errors "No camera was found on this computer. Use the Phone tab instead." etc. |
| Phone page | "SmartHealth Hub" / "Patient photo" / "For patient {A. R.} · link works until {time}" / "Take photo" / "Choose from gallery" / "Send photo" / "Retake" / "Photo sent. It is on the computer now." / "Take another" / expired: "This photo link has expired or was replaced. Ask for a new QR code on the computer." |
| Registration stepper | "Identity", "Contact", "PhilHealth & health", "Photo" (+ hints) |
| PhilHealth block | "Is the patient covered by PhilHealth?" None / Member / Dependent; hints per choice; "12 digits, as on the PhilHealth ID or MDR."; dependent category "— Same as the member (optional) —" |
| Step 4 | "{name} is registered" / "Patient code {code} · A welcome SMS goes out if a mobile number was given."; "What next?" cards: "Open patient profile", "Health card", "Book first appointment", "Register another" |

## Appendix C: Extra admin command (as given in chat; email is a placeholder here)

```bash
# On the server (prompt azureuser@smarthealth-server), from /opt/smarthealth-hub
docker compose -f docker-compose.server.yml --env-file .env.server exec backend python -c "$(cat <<'EOF'
<contents of scratchpad/add_admin.py>
EOF
)" <new-admin-email>
# Prompts: Full name [System Administrator], Mobile (+639XXXXXXXXX, unique), Password (hidden) x2
# Prints: "Created: <email> | role admin | active True | MFA True" and "Admin accounts: N before, N+1 now."
```
`add_admin.py` logic: refuse if the email exists; `Role.name == "admin"`; creator = oldest active admin (audit `user_id`); `UserCreate(credential_mode="password", send_welcome_sms=False)`; `user_service.create_user` (Argon2id, uniqueness, CREATE audit). Existing accounts untouched.

## Appendix D: Manuscript facts verified this session (add to seq 16 Appendix C)

| Item | Fact |
|---|---|
| Missed-appointment SMS | Sent once per missed appointment, using the Manila calendar day (#75). |
| Patient photo | Staff take the patient photo with any phone by scanning a 15-minute QR link; the photo appears on the PC automatically; the phone page shows only initials; every photo is audited (#76). |
| ID scan | The government-ID OCR scan was removed (#76); do not describe OCR in the manuscript. |
| PhilHealth | Registration requires a 12-digit PhilHealth No. for members and dependents and a category for members (#76). |
| Testing | Backend 743 tests (run in UTC like production), frontend 297 tests. |

## Session Closed
**Closed at:** 2026-11-23 ~14:05 (Manila, UTC+8), after #78 was merged (`131a2c2`, CI 7/7 + Vercel green) and deployed (change-password 422/429 live in production OpenAPI)
**Commit:** the `session: photo-admin-profile-live` commit on branch `docs/handoff-seq17` that includes this note (run by the user from the commands Claude provided; merge via PR, docs only, no server update needed)
**Session status:** Handed off to next session
