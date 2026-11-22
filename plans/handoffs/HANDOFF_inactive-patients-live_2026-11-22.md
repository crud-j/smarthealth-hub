# Filipino SMS copy (#62) + handoff docs (#63) + no SMS for removed patients and reversible deactivation with an Inactive Patients page (#64): all merged; #64 backend live; next: user checks of #64, then remaining defense items

**Date:** 2026-11-22
**Status:** COMPLETED (3 PRs merged this session, all CI green on `main` = `d6d5977`; production OpenAPI already exposes the #64 routes, so `deploy.sh` ran; the user has not yet reported the browser checks for #64)
**Bead(s):** none (`bd` CLI not installed on this PC)
**Epic:** Deploy SmartHealth Hub to production and harden it for the thesis defense (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `14`
**Parent:** `HANDOFF_filipino-sms-copy-in-progress_2026-11-22.md` (written by a Codex session; it has no seq number and says "continuing after seq 12", so it counts as seq 13)
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > `HANDOFF_nfc-backups-done_2026-11-19.md` > `HANDOFF_phase9-system-health-done_2026-11-19.md` > `HANDOFF_phase10-admin-model-b-done_2026-11-19.md` > `HANDOFF_allergies-media-banner-done_2026-11-20.md` > `HANDOFF_sidebar-and-admin-next_2026-11-20.md` > `HANDOFF_admin-security-settings-done_2026-11-20.md` > `HANDOFF_reliability-done-deploy-pending_2026-11-20.md` > `HANDOFF_signin-hardening-dashboard-next_2026-11-21.md` > `HANDOFF_role-dashboards-live_2026-11-21.md` > `HANDOFF_review-fixes-live_2026-11-22.md` (seq 12) > `HANDOFF_filipino-sms-copy-in-progress_2026-11-22.md` (seq 13, Codex) > this

> ⚠️ This repo is **PUBLIC**. This file contains no passwords, keys, email
> addresses, phone numbers, patient names/codes, staff names, OTP codes or NFC
> signatures. Names in tests ("Ana Reyes", "Dina Activa", "Test Admin",
> "Old Record", "Resa Test") are invented.

---

## Stale References

Identifiers from the parents (seq 12 / seq 13) that changed on purpose this session:

- `sms_resend_service.resend_problem` message **"The patient record is missing or archived."**: **gone**. Now three messages: "The patient record is missing." / "The patient is inactive. Reactivate them on the Inactive Patients page first." / "The patient is archived. Restore them from the Patient Archive first." (archived was not checked at all before).
- `patient_service.deactivate_patient(db, patient_id, by_id, ip_address) -> None`: **signature changed** to `deactivate_patient(db, patient_id, by_id, reason=None, ip_address=None) -> Patient`; raises `ValueError` if already inactive (→ 409); sets `deactivated_at/by/reason`; audit action **`DEACTIVATE`** (was `DELETE`).
- Audit action `DELETE` for patient deactivation: **no longer written**. Old rows keep `DELETE`. `audit_anomaly_service.check_after_hours_deletes` now matches `_DEACTIVATION_ACTIONS = ("DEACTIVATE", "DELETE")`; detail text "Patient record deactivated (entity_id=…)" (was "DELETE on patient record …").
- Test `test_patients.py::test_deactivate_patient_writes_delete_audit_log`: **renamed** `test_deactivate_patient_writes_deactivate_audit_log` (asserts `DEACTIVATE`).
- Frontend `useDeactivatePatient().deactivatePatient(id)` (DELETE `/patients/{id}`, `error: ApiError`): **changed** to `deactivatePatient(id, reason)` → `POST /patients/{id}/deactivate` `{reason}`, `error: string | null`.
- Patient page `handleDeactivate()` with `window.confirm(...)` + `router.push("/patients")`: **gone**; now `DeactivatePatientDialog` + stays on the page + `refetch()`.
- Reminder jobs' inline `Patient.mobile_number.isnot(None), Patient.sms_opt_out.is_(False)`: **replaced** by `*_patient_can_be_texted()` in all three jobs.
- Seq 13's "Full backend pytest: not run": **resolved** (584 passed, then 617 after #64).
- `DEV-WORKFLOW.md` §7 still says "it was `0028` … next is `0029`": **stale**; head is now **0032**, next is **0033**.
- `DEV-WORKFLOW.md` §4 still says frontend `npm run dev`: contradicts the pnpm rule; use `pnpm dev` (not fixed, docs only).

## Since Last Handoff

- **Seq 13 "Where to start" (full backend suite with Docker)**: done. Docker Desktop started from the session (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`), engine ready in under 5 min, **584 passed in 161.68 s**.
- **Seq 13 "give the user commit/PR instructions"**: done. User committed and pushed; **PR #62** (`fix/filipino-sms-copy`, merge `6e38412`) and **PR #63** (`docs/handoff-seq12`, now carrying both the seq 12 and seq 13 handoffs, merge `050fb9f`) merged; CI all green; Vercel green; user: "it works now."
- **Seq 13 "deploy + check Filipino template"**: user reported it works (Filipino SMS template review "works").
- **Seq 12 item 2 (Sitio/Purok demo data)**: user: "This one already works" — **done** (by the user in the UI).
- **Seq 12 item 4 "deactivate the allergy test patient"**: user was confused by Deactivate vs Archive ("where does it go when deactivated?") → investigation found (a) deactivated patients had no list and no undo in the UI and (b) **a real bug: all three SMS jobs texted deactivated and archived patients** → user: "fix the bug you found first and ensure that the data is not completely deleted … reversible records that can be restored" → **PR #64** (2 commits) merged `d6d5977`, CI green, backend deployed (routes in production OpenAPI).
- **Manuscript wording**: explained with verified facts (Recharts, WeasyPrint scope, email OTP vs passkey, 2 of 5 web workers actually wired, OTP code in subject). User writes the manuscript.
- **Codex prompt** (start of session): refined the paste prompt for Codex (GPT-6-Luna-MAX); saved in the session scratchpad (lost after cleanup; content summarised below in Appendix A).
- **Trajectory**: still defense hardening; the user keeps finding confusing UX and asks for plain explanations, then a fix; one PR per request; user merges + deploys quickly (within minutes).

## Reference Documents

- `CLAUDE.md`: conventions (Admin model B, audit every write, Alembic-only schema changes, AES-256-GCM fields, module boundaries, no PHI on NFC/QR).
- `DEV-WORKFLOW.md`: §3 git, §4 local dev (says npm, use pnpm), §5 CI checks + Docker test DB, §6 `deploy.sh`, §7 migrations (number stale), §9 server cheat sheet + job times, §13 agreements.
- `docs/SmartHealth_Hub_System_Development_Plan.md` (git-ignored, local): authoritative scope.
- Parents: `plans/handoffs/HANDOFF_review-fixes-live_2026-11-22.md` (seq 12: #54–#61 internals, design tokens Appendix D, frontend test patterns Appendix E, OTP history Appendix F), `plans/handoffs/HANDOFF_filipino-sms-copy-in-progress_2026-11-22.md` (seq 13: Filipino SMS change; has an "Update" section added this session).
- Claude memory (`C:\Users\githu\.claude\projects\c--Users-githu-OneDrive-Documents-smarthealth-hub\memory\`): `local_db_tests.md` (Docker test DB + sa21 mypy recipe), `deployment_setup.md`, `feedback_no_secret_screens.md`, `feedback_ci_logs.md`, `pnpm_not_npm.md`, `web_workers_testing.md`, `project_scaffold.md`. No memory files changed this session.

## The Goal

SmartHealth Hub (thesis: Barangay Health Center records with NFC/QR health cards, SMS reminders, OTP MFA) runs in production for the thesis defense: website `https://smarthealth-hub-two.vercel.app` (Vercel, auto-deploys on merge to `main`), API `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose, deployed by the user with `bash /opt/smarthealth-hub/scripts/deploy.sh` **on the server**). This session shipped clearer Filipino SMS texts (#62), merged two handoff notes (#63), and fixed a privacy/consent bug where patients taken out of daily work (deactivated or archived) still received SMS, while making deactivation a reversible, visible, audited switch (#64). Remaining: the user's browser checks of #64, then the user-only defense items (manuscript, SIM load, NTAG215).

## Where We Are

### Production
- `origin/main` = **`d6d5977`** (merge of #64). Local `main` is behind (still `050fb9f` locally until `git pull`); local branch `fix/inactive-patients` exists with upstream **gone** (merged + deleted on GitHub) — safe to delete.
- CI on `d6d5977`: pytest ✅, mypy ✅, lint BE ✅, lint FE ✅, tsc ✅, FE build ✅, Docker build ✅, Vercel ✅ (changelog job skipped as usual).
- Production `/health` → `{"status":"ok","service":"smarthealth-hub-api","version":"0.1.0"}`.
- Production `/openapi.json` contains `/api/v1/patients/inactive` and `/api/v1/patients/{patient_id}/reactivate` → backend runs #64 code → **migration 0032 has run** (backend applies migrations on start).
- Website `/patients/inactive` → 307 (redirect to login when anonymous = protected, correct).
- **User browser checks for #64: not yet reported.**

### Deploy status per PR (this session)
| PR | What | Backend deploy needed | Status |
|---|---|---|---|
| #62 | Filipino SMS copy | yes | merged + deployed; user: "it works now" |
| #63 | seq 12 + seq 13 handoffs | no (docs) | merged |
| #64 | no SMS for removed patients + reversible deactivation + Inactive Patients page + migration 0032 | yes | merged + deployed (OpenAPI proof); user checks pending |

### What exists now (#64)
- **SMS jobs** (`backend/app/workers/reminder_scheduler.py`): `_patient_can_be_texted()` returns `(mobile_number IS NOT NULL, sms_opt_out IS FALSE, is_active IS TRUE, archived_at IS NULL)`, spread into the WHERE of `_dispatch_appointment_reminders_async`, `_dispatch_immunization_reminders_async` and step 2 of `_mark_missed_appointments_async` (step 1 still marks missed for everyone, so records stay correct).
- **Resend** refuses missing / inactive / archived with separate messages (409 via endpoint; dashboard `can_resend=false`).
- **API**: `POST /api/v1/patients/{id}/deactivate` (Admin; body `{reason}` 5–1000 chars; 200 PatientResponse; 404; 409 already inactive), `POST /api/v1/patients/{id}/reactivate` (Admin; 409 already active), `GET /api/v1/patients/inactive?q=&page=&page_size=` (Admin + Physician; VIEW_PHI audit `entity_type="patient_inactive_list"`), `DELETE /api/v1/patients/{id}` kept (Admin; same as deactivate with no reason; 204; now 409 if already inactive).
- **PatientResponse** gains `deactivated_at`, `deactivated_by`, `deactivated_by_name`, `deactivation_reason` (name filled on GET `/patients/{id}` and on deactivate; reactivate response leaves it null because fields are cleared).
- **DB**: `patients.deactivated_at TIMESTAMPTZ NULL`, `patients.deactivated_by UUID NULL FK users ON DELETE SET NULL (fk_patients_deactivated_by_users)`, `patients.deactivation_reason TEXT NULL` (migration `0032_patient_deactivation_details.py`, head 0032).
- **Audit**: `DEACTIVATE` metadata `{patient_code, reason}`; `REACTIVATE` metadata `{patient_code, previous_reason}`.
- **Frontend**: sidebar "Inactive Patients" (Patient Care group, Admin + Physician, icon `inactive`), page `/patients/inactive` (explainer Deactivated vs Archived, search, table Patient / Deactivated / By / Reason, "Not recorded" for old rows, "Also archived" chip, Reactivate + confirm dialog for Admin, success notice "{name} is active again."), patient page `DeactivatePatientDialog` (reason required, "Nothing is deleted.") + `InactivePatientBanner` (since/by/reason + "Reactivate patient" for Admin + link "All inactive patients"), Archive page line "Looking for a deactivated patient? Inactive Patients", Audit Log filter + badges for DEACTIVATE / REACTIVATE / ARCHIVE / UNARCHIVE.
- **Tests**: backend full suite **617 passed** (start of session 582; after #62 584); frontend vitest **217 passed** (was 206); lint 0 errors / 81 warnings (unchanged).

### Local state (uncommitted on purpose; never commit without asking)
- `README.md` (user's ssh line), `backend/celerybeat-schedule-shm`, `backend/celerybeat-schedule-wal`, `START.md`, `dump.rdb`, `start-tunnel.ps1`. `stash@{0}` ("WIP on main: d041507 …") still present — never drop.
- Docker Desktop was started this session; test containers `shh-test-pg` / `shh-test-redis` **stopped** (they run with `--rm`, so they are gone).
- This handoff is untracked on branch `fix/inactive-patients` until the user follows the close commands.

## What We Tried (Chronological)

1. **Codex prompt refinement** (user: "I want to use this prompt on codex (GPT-6-Luna-MAX) … refine the prompt so it accurately modify the files needed … and to give me the commands for server, deploy, commit"). Read the seq 12 handoff, `DEV-WORKFLOW.md`, `scripts/deploy.sh`, memories. Findings baked into the prompt: `bd` not installed (`bd: command not found`); seq 12 handoff only on pushed-but-unmerged `docs/handoff-seq12` (`git show origin/docs/handoff-seq12:<path>` fallback); Codex reads `AGENTS.md` not `CLAUDE.md` (no `AGENTS.md` / `.codex` in repo); next Alembic was 0032 then; DEV-WORKFLOW §4 `npm run dev` contradicts pnpm; handoff's `git pull && bash scripts/deploy.sh` has a redundant pull. Saved `codex-prompt-seq12.md` in the session scratchpad. Offered to create `AGENTS.md` (no answer).
2. **Codex worked between sessions** (seq 13): branch `fix/filipino-sms-copy`, 5 files staged, focused tests + ruff + mypy + frontend green; full pytest blocked (Docker engine pipe `dockerDesktopLinuxEngine` missing).
3. **Review of seq 13** (user: "review … and tell me what's next"): verified staged stat **5 files, +55/−12**, no unstaged edits on them, Docker still down. Code review: suffix sizing uses `160 - len(confirm_suffix)` so both languages fit; `preferred_language` is `Literal["en","fil"]` and `system_settings_service` resolves unknown → `"en"`, so suffix and template language always match; inbound regex `\bCONFIRM\s+(\d{4})\b` and resend `re.compile(r"CONFIRM \d{4}")` unaffected; Settings page reads `send_limit` per template from API (`SmsTemplateEditor.tsx`, "Reset to default" button exists). Nits only: Filipino immunization drops "Bring health card"; Filipino missed says "Tumawag" (call) vs English "contact".
4. **Full suite + PR packaging** (user: "give me these: Commit and open a PR …"): started Docker Desktop from PowerShell, polled `docker info` until ready, ran the two `docker run` lines, **584 passed in 161.68 s**. Measured template lengths with LONG_VALUES (table in Evidence). Checked GitHub API: no PR existed for `docs/handoff-seq12`. Decision: put the seq 13 handoff on `docs/handoff-seq12` → one docs PR for both. Added an "Update (later the same day)" section to the seq 13 handoff (584 passed; stat re-checked). Wrote commit messages + PR bodies (scratchpad). User merged **#62** and **#63**; verified CI on `050fb9f` all green, Vercel green, `/health` ok.
5. **Deactivate vs Archive investigation** (user: "where can i deactivate the allergy? … i'm confuse why there's a deactivate patient and where does it goes when deactivated?"): found `DELETE /patients/{id}` = `is_active=False` only, admin-only, audit `DELETE`; `list_patients` filters `is_active` and hides archived; **no UI lists inactive patients and no reactivate route/button existed**; Archive has `/patients/archived` + Unarchive. Then grep showed **`reminder_scheduler.py` had no `is_active`/`archived_at` filter in any of the 3 SMS jobs** (only mobile + opt-out) → removed patients kept getting SMS. Also found: `sms_resend_service` checked `is_active` only (message said "archived"); `appointment_service._get_patient_or_404` blocks booking for inactive (not archived); visits/immunizations have no inactive guard; manual SMS send (`sms.py` ~199) requires active only; STOP opt-out lookup (`sms.py` ~622) only matches active patients.
6. **Manuscript facts verified**: `pdf_renderer.py` (WeasyPrint + Jinja2) used by `health_cards.py` (single ~2178 + batch ~1464) and `patients.py` (summary PDF ~789); report export is CSV/JSON, not WeasyPrint. `passkey_service.py`: FIDO2/WebAuthn, `user_verification=REQUIRED`, authentication "complete → issue JWTs" (alternative sign-in, replaces password + OTP). Workers: 5 files in `frontend/web/workers/` (analyticsAggregator, csvExport, patientSearch, qrGenerator, qrScanner) but only `csvExport` (Reports page) and `qrScanner` (Health Cards → Verify) are started by pages. Recharts imported in 5 component files.
7. **Fix design** (user: "Yes fix the bug you found first and ensure that the data is not completely deleted when user deactivate, just put an inactive, and reversible records that can be restored." + definitions of Deactivation vs Archiving): new POST deactivate/reactivate + GET inactive; keep DELETE route; columns via migration; audit DEACTIVATE/REACTIVATE; Inactive Patients page; reason required. Created local branch `fix/inactive-patients` from updated `main`.
8. **Backend test-first**: `tests/test_patient_deactivation.py` (33 tests). First added the 3 model columns (pure addition) so `Patient(deactivated_at=…)` would not TypeError. Red: **30 failed / 9 passed**; SMS failures were `assert 1 == 0` (one SMS queued for a removed patient = the bug reproduced), resend `'inactive' in 'the patient record is missing or archived.'` false, new routes 404/422 (e.g. `/patients/inactive` parsed as UUID → 422 "invalid character: found `i`"). Fixed attribute name in tests (`AuditLog.metadata_`, not `audit_metadata`).
9. **Backend implementation**: helper `_patient_can_be_texted()` (Python script with CRLF-preserving replace; asserted exact occurrence counts 2 + 1). Endpoint edit first attempted as an inline bash heredoc → **failed** with `unexpected EOF while looking for matching '''` (Python triple quotes inside the heredoc confused the tool wrapper) → wrote the edit script to the scratchpad and ran it (`edit_patients_endpoints.py`) → worked. Green: **162 passed** across `test_patient_deactivation.py`, `test_patients.py`, `test_sms_resend.py`, `test_sms.py`, `test_immunization_reminders.py`, `test_system_settings.py` (66 s).
10. **Migration 0032 tested by hand** on a scratch DB `mig_check` in the test container: `alembic upgrade 0031` → insert role/user/3 patients + 3 DELETE audit rows → `upgrade head` → backfill correct (latest DELETE used, unlogged inactive left NULL, active untouched) → `alembic heads` = `0032 (head)` → `downgrade -1` (0 deactivat* columns) → `upgrade head` again OK → dropped `mig_check`.
11. **Backend checks**: `ruff check app` clean; `ruff format` reformatted 2 files (migration + patient_service); `ruff format --check app` 118 formatted; `mypy app` clean (118 files); SQLAlchemy 2.1.9 installed to scratchpad `sa21/` → `MYPYPATH=sa21 mypy` → only the known `langhelpers.py:466` artifact.
12. **Frontend test-first**: `tests/components/PatientDeactivation.test.tsx` (10) + nav test (admin/physician layouts + `/patients/inactive` active-href case). Stubs first (components returning null, page returning null, stub `useReactivatePatient`). Red: **13 failed** (10/10 new + 3 nav). Implementation → **29 passed** (new + nav files). `tsc` then flagged the test (`serve(items: (typeof row)[])` with `oldRow` nulls) → changed to `serve(items: object[])` → tsc clean.
13. **Full verification**: vitest **217 passed / 29 files**; lint **0 errors, 81 warnings** (same as before; the 5 warnings in touched files pre-exist, e.g. `usePatients.ts:652` set-state-in-effect); `pnpm run build` compiled, route list shows `○ /patients/inactive`; `git checkout -- next-env.d.ts`. Full backend **617 passed in 149.44 s**.
14. **Packaging**: computed per-commit stats on a temporary index (`GIT_INDEX_FILE=<scratchpad>/tmpindex`): backend **13 files, +971/−33**, frontend **11 files, +836/−20**, total 24 files +1807/−53. Git warned "LF will be replaced by CRLF" for new files and `archived/page.tsx` (which was LF in HEAD already; diff only +6) → harmless. User committed `b49941a` + `fedda33` (stats match exactly), pushed, **PR #64** merged 2026-11-22T03:26:37Z as `d6d5977`; backend deployed (OpenAPI proof at handoff time).

## Key Decisions

- **Deactivate and Archive stay two different things**, matching the user's definitions: Deactivate = "disables an active … item from being used right now" (hidden, no SMS, no booking, reversible via Reactivate); Archive = "store historical … records cleanly without cluttering active views" (hidden, no SMS, restorable via Unarchive). Rejected: removing Deactivate and keeping only Archive; merging both into one page.
- **Nothing is ever deleted**: deactivation sets `is_active=False` + details; `DELETE /patients/{id}` kept only for compatibility and does the same. Rejected: removing the DELETE route (older cached frontends would break during the Vercel→deploy.sh gap).
- **Audit action renamed `DELETE` → `DEACTIVATE`** for patient deactivation (the word "DELETE" in the Audit Log suggested data loss). Old rows untouched (append-only table); the after-hours alert counts both (`_DEACTIVATION_ACTIONS`), same pattern as `VIEW_PHI`/`PHI_VIEW` in #55.
- **Reason required (5–1000 chars)** on `/deactivate`, mirroring `PatientArchiveRequest`. Optional only in the service for the legacy DELETE route.
- **When/who/why stored on the patient row** (migration 0032) instead of reading the audit log at display time: simple queries, sortable list. Cleared on Reactivate; history stays in audit rows (`previous_reason`).
- **Backfill from old `DELETE` audit rows** (latest per patient; `deactivated_by` only if that user still exists) so already-inactive patients show a date + staff; reason stays NULL ("—" / "Not recorded"). `audit_logs` only read.
- **Staff name, not UUID**: `deactivated_by_name` via `patient_service.user_names(db, ids)`; the Archive page still shows `archived_by` as a raw UUID (left as is; follow-up candidate).
- **Inactive list visible to Admin + Physician, Reactivate Admin only** (mirrors `/patients/archived` roles and the admin-only deactivate). Physicians see demographics only (Admin model B unaffected).
- **After deactivating, stay on the patient page** (banner + Reactivate visible = proof nothing was deleted) instead of the old `router.push("/patients")`.
- **Mark-missed job still marks appointments missed for removed patients**; only the SMS is skipped (records stay correct).
- **Scope left out on purpose** (to ask later): blocking new visits/immunizations for inactive patients; archived patients can still be booked; manual SMS to archived patients; STOP lookup for inactive patients.
- **Handoff placement**: seq 13 note shipped in the existing `docs/handoff-seq12` branch → one docs PR (#63). This seq 14 note goes to a new `docs/handoff-seq14` branch.
- **Two commits for #64** (backend, frontend) in one PR, per the "one PR per user turn, several commits" pattern.

## Evidence & Data

### PRs this session
| PR | Branch | Commits | Merge | Files | +/− | Deploy |
|---|---|---|---|---|---|---|
| #62 | fix/filipino-sms-copy | `5744a59` fix(sms): clearer Filipino reminder texts with opt-out and CONFIRM line | `6e38412` | 5 | +55/−12 | deploy.sh ✅ (user: "it works now") |
| #63 | docs/handoff-seq12 | `653678e` seq 12 handoff, `be684d1` docs(handoff): Filipino SMS copy session note | `050fb9f` | 1 + 1 | +506 / +146 | none |
| #64 | fix/inactive-patients | `b49941a` fix(patients): no SMS for removed patients; reversible deactivation; `fedda33` feat(patients): Inactive Patients page and Reactivate | `d6d5977` | 13 + 11 | +971/−33, +836/−20 | deploy.sh ✅ (OpenAPI shows new routes); user checks pending |

### CI per merge commit
| Commit | pytest | mypy | lint BE | lint FE | tsc | FE build | Docker | Vercel |
|---|---|---|---|---|---|---|---|---|
| `050fb9f` (#62+#63 on main) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `fedda33` (#64 branch) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (preview) |
| `d6d5977` (#64 merge) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Test count history
| Point | Backend | Frontend | Notes |
|---|---|---|---|
| Session start (main `ccd12a2`) | 582 | 206 | from seq 12 |
| #62 (Filipino SMS) | **584** (161.68 s) | 206 | +2 template tests |
| #64 targeted green | 162 (6 files, 66 s) | 29 (2 files) | |
| #64 full | **617** (149.44 s) | **217** (29 files) | +33 backend, +11 frontend |

### Red → green (#64)
| Test file | Red | Why red | Already held (passed in red) |
|---|---|---|---|
| `tests/test_patient_deactivation.py` | 30 failed / 9 passed | SMS jobs queued 1 SMS for inactive/archived (`assert 1 == 0`); resend message lacked "inactive"; routes missing (`/inactive` → 422 UUID parse, `/deactivate` `/reactivate` 404/405); audit action DELETE not DEACTIVATE | active patient still reminded; reactivated patient reminded (trivially, no filter yet); unknown patient 404; legacy `DELETE` after-hours row; some role/422 cases |
| `tests/test_patients.py::test_deactivate_patient_writes_deactivate_audit_log` | 1 failed | DELETE row written | — |
| `tests/components/PatientDeactivation.test.tsx` | 10 failed | stubs render null / stub hook | — |
| `tests/lib/navigation.test.ts` | 3 failed | no "Inactive Patients" link | other 16 |

### New backend tests (33) in `tests/test_patient_deactivation.py`
| Class / function | Tests |
|---|---|
| `TestRemindersSkipRemovedPatients` | active still reminded (1); no appointment reminder [inactive, archived] (2); no immunization reminder ×2; no missed text but still marked missed ×2; resend refuses archived (1); resend says inactive (1) = 9 |
| `TestDeactivate` | keeps record + when/who/why + GET still works; DEACTIVATE audit with reason and no DELETE row; needs reason [missing, too_short]; twice → 409; old DELETE route only deactivates; admin only [bhw, physician, admin_staff] = 9 |
| `TestReactivate` | switches back on + back in list + REACTIVATE audit `previous_reason`; reactivated patient gets reminders again; active → 409; unknown → 404; admin only ×3 = 7 |
| `TestInactiveList` | only inactive with when/who/why; pre-change row listed with null date; VIEW_PHI audit `patient_inactive_list`; roles [physician 200, bhw 403, admin_staff 403] = 6 |
| `test_after_hours_alert_counts_deactivations` | [DEACTIVATE, DELETE] = 2 |

### Migration 0032 hand test (scratch DB `mig_check`)
```
patient_code | is_active | deactivated_at         | has_by | deactivation_reason
MIG-1        | f         | 2026-11-05 02:00:00+00 | t      |        (two DELETE rows: 11-01 and 11-05 → latest used)
MIG-2        | f         |                        | f      |        (inactive, no audit row → stays NULL)
MIG-3        | t         |                        | f      |        (active with a DELETE row → untouched)
alembic heads → 0032 (head); downgrade -1 → 0 deactivat* columns; upgrade head → 0032 (head)
```

### SMS jobs before / after #64
| Job | Time (Manila) | Filter before | Filter after |
|---|---|---|---|
| Appointment reminder | every hour :00 | mobile + not opted out | + `is_active` + `archived_at IS NULL` |
| Immunization reminder | 10:00 | mobile + not opted out | + same |
| Missed-appointment SMS (step 2 of mark-missed) | 18:00 | mobile + not opted out | + same (step 1 marking unchanged) |
| Resend (button) | — | `is_active` only, message "missing or archived" | missing / inactive / archived, separate messages |

### Deactivate vs Archive (as built)
| | Deactivate | Archive |
|---|---|---|
| Column | `is_active=False` + `deactivated_at/by/reason` | `archived_at/by` + `archive_reason` |
| Who | Admin (reason required) | Admin (reason required) |
| List / search | hidden | hidden |
| SMS (3 jobs + resend) | none | none |
| New appointment booking | blocked (`_get_patient_or_404`) | **allowed** |
| New visit / immunization | **allowed** (no guard) | allowed |
| Page | `/patients/inactive` (Admin + Physician) | `/patients/archived` (Admin + Physician) |
| Undo | Reactivate (Admin) | Unarchive (Admin) |
| Audit | DEACTIVATE / REACTIVATE (old: DELETE) | ARCHIVE / UNARCHIVE |

### Filipino SMS templates (#62), before → after
| Template | Before | After |
|---|---|---|
| Appointment | Kamusta {patient_name}, paalala: {appointment_type} sa {bhc_name}, {scheduled_date} {scheduled_time}. STOP para mag-opt out. | Paalala, {patient_name}: {appointment_type} sa {bhc_name}, {scheduled_date} {scheduled_time}. STOP para ihinto ang SMS. |
| Immunization | Kamusta {patient_name}, ang {vaccine_name} (dose {dose_number}) ay dapat ibigay sa {due_date}. Pakidalaw ang {bhc_name}. | {patient_name}, nakatakda ang {vaccine_name} (dosis {dose_number}) sa {due_date} sa {bhc_name}. STOP para ihinto ang SMS. |
| Missed | Kamusta {first_name}, napansin namin na hindi ka dumating sa iyong appointment ngayon. Makipag-ugnayan sa {bhc_name} para mag-reschedule. | Kamusta {first_name}, hindi ka nakadalo sa appointment. Tumawag sa {bhc_name} para magpa-iskedyul muli. STOP para ihinto ang SMS. |
CONFIRM suffix: en `" CONFIRM 1234 to confirm."` (25), fil `" CONFIRM 1234 para kumpirmahin."` (31). Limits: `APPOINTMENT_TEMPLATE_LIMIT = 135`, `FIL_APPOINTMENT_TEMPLATE_LIMIT = 129`.

### Template lengths with LONG_VALUES (whole SMS incl. CONFIRM)
| Template | en | fil |
|---|---|---|
| appointment_reminder (template / whole) | 130 / 155 | 127 / 158 |
| immunization_reminder | 159 | 150 |
| missed_appointment | 117 | 143 |

### Production probes at handoff time
| Check | Result |
|---|---|
| `/health` | `{"status":"ok",...}` |
| `/openapi.json` has `/api/v1/patients/inactive` | True |
| `/openapi.json` has `/api/v1/patients/{patient_id}/reactivate` | True |
| Website `/patients/inactive` anonymous | 307 (to login) |
| GitHub PRs `docs/handoff-seq12` before #63 | none existed (API `pulls?head=…&state=all` → `no PR`) |

### Manuscript facts (verified in code, for the user's thesis text)
| Item | Fact |
|---|---|
| Charts | Recharts (5 component files import `recharts`) |
| WeasyPrint | `app/services/pdf_renderer.py` (WeasyPrint + Jinja2): health card PDF (CR80 85.6×54 mm, front+back, single + batch) and patient summary PDF; reports export is CSV/JSON |
| Sign-in | password + 6-digit **email** OTP (10 min); passkey (FIDO2/WebAuthn, `user_verification=REQUIRED`) is an **alternative** sign-in that issues JWTs directly |
| Web workers | Comlink; 5 worker files, only `csvExport.worker.ts` (Reports) and `qrScanner.worker.ts` (Health Cards → Verify) are started by pages |
| OTP subject | "123456 is your SmartHealth Hub sign-in code" since #61; code never logged |

## Code Analysis

- `reminder_scheduler._patient_can_be_texted() -> tuple[Any, ...]` imports `Patient` locally (module imports models inside functions). Used as `*_patient_can_be_texted(),` in three `.where(...)` calls.
- `patient_service.deactivate_patient(db, patient_id, by_id, reason=None, ip_address=None) -> Patient`: `get_patient` (no active filter) → `ValueError` if inactive → sets fields, `updated_at = now`, audit DEACTIVATE, commit, refresh, `_invalidate_analytics_cache()`.
- `patient_service.reactivate_patient(db, patient_id, by_id, ip_address=None) -> Patient`: `ValueError` if active → clears fields → audit REACTIVATE `{patient_code, previous_reason}`.
- `patient_service.list_inactive_patients(db, *, q, page, page_size)`: `is_active IS FALSE`, ilike on last/first name, code, mobile; order `deactivated_at DESC NULLS LAST, updated_at DESC`.
- `patient_service.user_names(db, ids: Iterable[UUID | None]) -> dict[UUID, str]` (one `SELECT id, full_name FROM users WHERE id IN …`).
- `endpoints/patients.py`: `_build_patient_response(patient, *, deactivated_by_name=None)`; `_patient_response_with_names(db, patient)` used by GET `/{id}` and POST `/deactivate`; `/inactive` registered **before** `/{patient_id}` (same reason as `/archived`); route functions `list_inactive_patients`, `deactivate_patient` (DELETE), `deactivate_patient_with_reason`, `reactivate_patient`.
- Schemas (`app/schemas/patient.py`): `PatientDeactivateRequest(reason: 5..1000)`, `InactivePatientSummary` (computed `age`, `full_name`), `PaginatedInactivePatients`; `PatientResponse` + 4 deactivation fields.
- Model (`app/models/patient.py`): FK named `fk_patients_deactivated_by_users`; Patient↔User relationships use explicit `foreign_keys` (`created_by`), so a third FK to users caused no ambiguity.
- Frontend: `app/(dashboard)/patients/_components/PatientDeactivation.tsx` exports `DeactivatePatientDialog({patientName,onConfirm,onCancel,loading,error?})` (role=dialog, `useId` label, button disabled until trimmed reason ≥ 5) and `InactivePatientBanner({deactivatedAt,deactivatedByName,deactivationReason,canReactivate,onReactivate,reactivating})` (role=region via `<section aria-labelledby>`). `app/(dashboard)/patients/inactive/page.tsx` avoids the `set-state-in-effect` lint rule: result `{key, data?, error?}`, `loading = result?.key !== key`, setState only in promise callbacks, fetch only when role is admin/physician, "Loading..." while `user` is null.
- `hooks/usePatients.ts`: `useDeactivatePatient` (POST + JSON body), `useReactivatePatient` (POST); `PatientApiResponse` optional `deactivated_*` fields mapped in `mapPatient` (older backend → null).
- `lib/navigation.ts` `NavIcon` gains `"inactive"`; `components/layout/Sidebar.tsx` `IconInactive` (person + slash circle) in `NAV_ICONS`.

## Files Changed

### Backend source (#64, commit `b49941a`)
- `backend/alembic/versions/0032_patient_deactivation_details.py` (new): 3 columns + backfill from latest `DELETE` audit row.
- `backend/app/models/patient.py`: `deactivated_at`, `deactivated_by`, `deactivation_reason`.
- `backend/app/schemas/patient.py`: response fields, `PatientDeactivateRequest`, `InactivePatientSummary`, `PaginatedInactivePatients`.
- `backend/app/services/patient_service.py`: deactivate (reason, 409, DEACTIVATE), `reactivate_patient`, `list_inactive_patients`, `user_names`; imports `Iterable`, `User`.
- `backend/app/api/v1/endpoints/patients.py`: `/inactive`, `/deactivate`, `/reactivate`, DELETE kept, response with names.
- `backend/app/workers/reminder_scheduler.py`: `_patient_can_be_texted()` in 3 jobs.
- `backend/app/services/sms_resend_service.py`: missing / inactive / archived messages.
- `backend/app/services/audit_anomaly_service.py`: `_DEACTIVATION_ACTIONS`, detail text.
- `backend/app/services/audit_service.py`, `backend/app/models/audit_log.py`, `backend/app/workers/audit_tasks.py`: docstrings list DEACTIVATE / REACTIVATE / ARCHIVE / UNARCHIVE.

### Backend tests (#64)
- `backend/tests/test_patient_deactivation.py` (new, 33).
- `backend/tests/test_patients.py` (DEACTIVATE assertion, renamed test).

### Frontend (#64, commit `fedda33`)
- `frontend/web/app/(dashboard)/patients/_components/PatientDeactivation.tsx` (new).
- `frontend/web/app/(dashboard)/patients/inactive/page.tsx` (new).
- `frontend/web/app/(dashboard)/patients/[patientId]/page.tsx`: dialog, banner, reactivate, refetch.
- `frontend/web/app/(dashboard)/patients/archived/page.tsx`: link to Inactive Patients (+6 lines; file is LF).
- `frontend/web/app/(dashboard)/settings/audit-log/page.tsx`: ACTIONS + badges.
- `frontend/web/components/layout/Sidebar.tsx`: `IconInactive`.
- `frontend/web/hooks/usePatients.ts`, `frontend/web/lib/navigation.ts`, `frontend/web/types/patient.ts`.
- Tests: `frontend/web/tests/components/PatientDeactivation.test.tsx` (new, 10), `frontend/web/tests/lib/navigation.test.ts`.

### SMS (#62, commit `5744a59`, written by Codex, verified here)
- `backend/app/services/sms_templates.py`, `backend/app/services/system_settings_service.py`, `backend/app/workers/reminder_scheduler.py`, `backend/tests/test_sms_templates.py`, `backend/tests/test_system_settings.py`.

### Docs
- `plans/handoffs/HANDOFF_filipino-sms-copy-in-progress_2026-11-22.md`: "Update (later the same day)" section (584 passed, staged stat, PR plan) — in #63.
- This handoff (`plans/handoffs/HANDOFF_inactive-patients-live_2026-11-22.md`).

### Scratchpad (session-only; `C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\371e583d-0f12-46aa-9620-9b8205b7a25a\scratchpad\`, will be lost)
`codex-prompt-seq12.md`, `commit-filipino-sms-copy.txt`, `pr-body-filipino-sms-copy.md`, `commit-handoffs-seq12-13.txt`, `pr-body-handoffs-seq12-13.md`, `commit-inactive-patients-backend.txt`, `commit-inactive-patients-frontend.txt`, `pr-body-inactive-patients.md`, `edit_patients_endpoints.py`, `edit_hooks.py`, `edit_patient_page.py`, `sa21/` (SQLAlchemy 2.1.9 for mypy), `commit-handoff-seq14.txt` (close commit message).

## User Feedback & Preferences (REQUIRED)

- "I want to use this prompt on codex (GPT-6-Luna-MAX) … refine the prompt so it accurately modify the files needed … and to give me the commands for server, deploy, commit, and so on." → the user alternates between Claude Code and Codex; prompts must be self-contained (Codex doesn't load CLAUDE.md or memories).
- "review the … HANDOFF_filipino-sms-copy-in-progress … and tell me what's next" → wants verification + a clear ordered next-steps list.
- "give me these: Commit and open a PR … Merge the seq-12 handoff PR" → wants exact commands with expected `git diff --cached --stat` lines; the user commits/pushes/merges/deploys themselves.
- "it works now." → short confirmations; trust them (verify CI/health/OpenAPI independently).
- "This one already works (Fill in Sitio / Purok …)" and the Filipino review "works" → items closed by the user.
- "where can i deactivate the allergy? the deactivate only works for a patients, and i'm confuse why there's a deactivate patient and where does it goes when deactivated?" → UI wording/flows confuse them; explain in plain words with a table, then offer a fix.
- "please explain the (Manuscript wording …)" → wants concrete, accurate sentences they can adapt.
- "Yes fix the bug you found first and ensure that the data is not completely deleted when user deactivate, just put an inactive, and reversible records that can be restored." + definitions: "Deactivation (deactivation disables an active account or item from being used right now)" / "Archiving (Store historical, completed, or rarely used records cleanly without cluttering active views)" → these definitions are the spec for any further Deactivate/Archive work.
- "/handoff and close this session and give me the prompt i can use for the next fresh session" → prefers fresh sessions via handoff + paste prompt.
- Selects whole PR bodies in the IDE before posting → PR bodies must stand alone.
- (Carried) commits via `git commit -F <file>`; pnpm not npm; never open `.env` in editors; say "on the server (prompt `azureuser@smarthealth-server`)" for server commands; repo is public, no PHI anywhere; screenshots are verification of record.

## Where We're Going

1. **START HERE: confirm #64 in the browser (user checks).** Backend is already live (OpenAPI shows the routes). Ask the user to (Ctrl+Shift+R first):
   - Settings → System Health: Version shows the `d6d5977` deploy.
   - Sidebar → Patient Care → **Inactive Patients** opens; previously deactivated patients are listed (date/"By" filled where an old DELETE audit row existed; reason "—").
   - Allergy test patient → **Deactivate Patient** → reason (e.g. "Test record") → grey "This patient is inactive" banner; gone from Patients search; listed on Inactive Patients.
   - Optional: **Reactivate patient** → back in search → deactivate again for the defense.
   - Settings → Audit Log → filter DEACTIVATE / REACTIVATE.
   If anything fails, use CI/OpenAPI/`/health` probes first, then ask for a screenshot.
2. **Merge this handoff**: branch `docs/handoff-seq14` (docs only, no deploy). Delete local `fix/inactive-patients` (`git branch -d fix/inactive-patients` after `git switch main; git pull`).
3. **Defense items (user-only, remind once)**: manuscript wording (facts table above); load the gateway SIM + test SMS; write the final NTAG215 from the demo patient's Print page; reprint cards printed before #50.
4. **Optional follow-ups (ask first, one PR each):**
   - Block new visits / immunizations for **inactive** patients (today only booking is blocked) — fits the user's "disabled from being used right now".
   - Patient Archive page shows `archived_by` as a raw UUID → show the staff name (reuse `patient_service.user_names`).
   - Manual "Send SMS" (`sms.py` ~199) still allows **archived** patients; STOP opt-out lookup (`sms.py` ~622) ignores inactive patients.
   - Decide whether archived patients may still be booked (today allowed).
   - Docs: DEV-WORKFLOW §4 `npm run dev` → `pnpm dev`; §7 migration number (head 0032, next 0033).
   - `AGENTS.md` for Codex sessions (offered, unanswered).
   - Seq 12 cleanup list still open (`PatientDemographicsChart.tsx:8` stale comment, `setex` deprecations, test-file ruff findings, `set-state-in-effect` warnings, favicon 404, legacy `backend/scripts/backup_db.py`, disabled `deploy.yml`).
5. **Possible follow-ups only if asked** (carried from seq 12): Resend button on SMS Logs page; physician "still undiagnosed" list; explicit visit↔appointment link; 4-digit CONFIRM token collisions.

## Risks & Blockers

- **#64 user checks not done yet**: no screenshot confirmation that the dialog/banner/page render as intended (no visual check was done this session; only jsdom tests + `next build`).
- **Inactive patients can still get visits/immunizations logged** via a direct URL (no guard); archived patients can still be **booked** (no SMS now, so a reminder will not go out for them).
- **Appointments of a deactivated patient stay pending** → the 18:00 job marks them missed (no SMS). After Reactivate, still-future appointments get reminders again (tested).
- **Old audit rows say `DELETE`** for past deactivations; the Audit Log filter has both; explain if asked ("it never deleted data").
- **Docker Desktop on this PC is flaky** (carried): start it with `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` and poll `docker info`; never run two pytest processes against `shh-test-pg`.
- (Carried) VM auto-shutdown 02:00 Manila; gateway SIM has no load; CI logs unreadable by Claude (user pastes); browser cache after Vercel deploys (Ctrl+Shift+R).

## Open Questions

1. Did the #64 browser checks pass (Inactive Patients page, dialog, banner, Reactivate, Audit Log filter)? How many patients were already inactive in production (backfill count)?
2. Should deactivated patients also be blocked from new visits/immunizations? Should archived patients be blocked from booking?
3. Does the user want an `AGENTS.md` for Codex sessions?
4. (Carried) Did the 10:00 Manila immunization reminder run show on Admin → System Health → reminder runs? Filipino SMS native-speaker review: user said it "works" — treat as done unless they say otherwise.

## Tooling Gotchas (cost time this session)

- **Inline bash heredocs containing Python `'''` strings can fail in the Bash tool** (`unexpected EOF while looking for matching '''`). Write the edit script to the scratchpad with Write, then `python <script> <args>`.
- **CRLF files**: use the Edit tool, or Python with `newline=""` + `\r\n`↔`\n` round-trip and `assert s.count(old) == 1`; never `sed -i`. New files written by the Write tool are LF; git (`core.autocrlf=true`) prints "LF will be replaced by CRLF" — harmless.
- **Per-commit stats before the user commits**: copy `.git/index` to a scratch file and use `GIT_INDEX_FILE=<copy> git add -- <paths>; GIT_INDEX_FILE=<copy> git diff --cached --shortstat` (the real index stays untouched). Git pathspecs with `[patientId]` / `(dashboard)` worked when quoted.
- **Model columns before red tests**: adding ORM columns first turns `TypeError: 'deactivated_at' is an invalid keyword argument` into behavioural reds (tests create tables with `create_all`, never Alembic).
- **Migration check**: CI never runs Alembic → test by hand: `CREATE DATABASE mig_check` in `shh-test-pg`, `DATABASE_URL=…/mig_check python -m alembic upgrade 0031`, insert rows via `docker exec -i shh-test-pg psql -U shh_test -d mig_check -v ON_ERROR_STOP=1`, `upgrade head`, check, `downgrade -1`, `upgrade head`, drop DB. `alembic/env.py` reads `settings.DATABASE_URL` (env var wins) and converts asyncpg → psycopg2.
- **`AuditLog` JSON column attribute is `metadata_`** (not `metadata` / `audit_metadata`).
- **FastAPI static segments** (`/inactive`, `/archived`) must be registered before `/{patient_id}` or they 422 as invalid UUIDs.
- **Git Bash path mangling**: `curl … https://host$u` with `u=/patients/inactive` printed `C:/Program Files/Git/patients/inactive` in the label (the URL itself was fine); use `MSYS_NO_PATHCONV=1` or quote differently for clean output.
- **`next build` rewrites `frontend/web/next-env.d.ts`** → `git checkout -- frontend/web/next-env.d.ts` (done).
- **jsdom tests vs tsc**: vitest doesn't type-check; always run `pnpm exec tsc --noEmit` (caught a test typing error here).

### Commands that worked
```bash
# CI + Vercel for a commit (PC, Bash tool)
SHA=$(git rev-parse origin/main)
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/$SHA/check-runs" | python -c "import sys,json; [print(r['name'],r['status'],r['conclusion']) for r in json.load(sys.stdin)['check_runs']]"
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/$SHA/status" | python -c "import sys,json; print(json.load(sys.stdin)['state'])"
# PR state for a branch (no gh CLI)
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/pulls?head=crud-j:<branch>&state=all" | python -c "import sys,json; print([(p['number'],p['state'],p['merged_at']) for p in json.load(sys.stdin)])"
# Is the backend running a route?
curl -s https://smarthealth-hub.japaneast.cloudapp.azure.com/openapi.json | python -c "import sys,json; print('/api/v1/patients/inactive' in json.load(sys.stdin)['paths'])"
# Docker Desktop (PowerShell) then wait in Bash
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 5; done
# Test DB + full suite (Bash, from backend/)
docker run -d --rm --name shh-test-pg -e POSTGRES_USER=shh_test -e POSTGRES_PASSWORD=shh_test -e POSTGRES_DB=smarthealthhub_test -p 127.0.0.1:5499:5432 postgres:18-alpine
docker run -d --rm --name shh-test-redis -p 127.0.0.1:6399:6379 redis:7-alpine
DATABASE_URL="postgresql+asyncpg://shh_test:shh_test@127.0.0.1:5499/smarthealthhub_test" REDIS_URL="redis://127.0.0.1:6399/0" python -m pytest -p no:warnings -o addopts="" -q
docker stop shh-test-pg shh-test-redis
# mypy as CI (SQLAlchemy 2.1)
pip install --no-deps --target <scratchpad>/sa21 "sqlalchemy>=2.1"; MYPYPATH=<scratchpad>/sa21 python -m mypy app --ignore-missing-imports
# Frontend (frontend/web)
pnpm exec tsc --noEmit; pnpm run lint; pnpm run test; pnpm run build; git checkout -- next-env.d.ts
```

## Timeline (user prompt → outcome)

| # | User said | Outcome |
|---|---|---|
| 1 | Codex prompt + "refine the prompt … give me the commands for server, deploy, commit" | Refined Codex prompt (scratchpad), findings list, AGENTS.md offered |
| 2 | "review … HANDOFF_filipino-sms-copy-in-progress … tell me what's next" | Verified staged stat + code review (no bugs, 2 nits); next-steps list |
| 3 | "give me these: Commit and open a PR … Merge the seq-12 handoff PR" | Docker started, 584 passed, commit/PR files, seq 13 Update section, commands |
| 4 | "it works now." | Verified #62 + #63 merged, CI/Vercel green, `/health` ok; listed defense items |
| 5 | Sitio/Purok done; "where can i deactivate the allergy? … confuse …"; Filipino review works; "explain the Manuscript wording" | Deactivate vs Archive explained; SMS bug found; manuscript facts verified |
| 6 | "Yes fix the bug … reversible records that can be restored" + definitions | #64 built test-first (617 / 217), migration 0032 hand-tested, commands |
| 7 | (user committed, pushed, merged #64, deployed) "/handoff and close this session" | This file; verified #64 CI + OpenAPI routes live |

## Quick Start for Next Session

```bash
# Reference docs
cat plans/handoffs/HANDOFF_inactive-patients-live_2026-11-22.md
cat CLAUDE.md
cat DEV-WORKFLOW.md

# Key files (explore adjacent code too)
backend/app/services/patient_service.py          # deactivate / reactivate / list_inactive / user_names
backend/app/api/v1/endpoints/patients.py         # /inactive, /deactivate, /reactivate, DELETE kept
backend/app/workers/reminder_scheduler.py        # _patient_can_be_texted()
backend/alembic/versions/0032_patient_deactivation_details.py
frontend/web/app/(dashboard)/patients/inactive/page.tsx
frontend/web/app/(dashboard)/patients/_components/PatientDeactivation.tsx

# Verify current state (PowerShell on PC)
git fetch --prune; git switch main; git pull; git log --oneline -3     # expect d6d5977 (+ handoff docs merge)
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health
# Full backend suite: see Commands that worked (expect 617 passed); frontend: cd frontend/web; pnpm run test (expect 217)

# Next action
# Ask the user for the #64 browser checks (Where We're Going 1); then offer the optional follow-ups one at a time.
```

## Appendix A: Codex paste prompt (refined this session; scratchpad copy will be lost)

Structure of the refined prompt given to the user for Codex (GPT-6-Luna-MAX), reusable by updating the handoff path:
1. **Read first**: the handoff (with `git show origin/<branch>:<path>` fallback if unmerged), `CLAUDE.md` (Codex doesn't auto-load it), `DEV-WORKFLOW.md` (§3–§7, §9, §12, §13), the Claude memory notes folder, the SDP sections touched. No `bd`.
2. **Onboarding then STOP** (5 steps as in the paste prompt), no writes before "go".
3. **Rules when changing files**: list files first; module boundaries; never touch README.md / celerybeat files / START.md / dump.rdb / start-tunnel.ps1 / `.env*` / `docs/` / `next-env.d.ts` / `stash@{0}`; audit every write (`VIEW_PHI`); Admin model B + `permissions.ts`; encrypted fields; Alembic hand-numbered (**next now 0033**); tz-aware datetimes; optional TS fields for new backend fields; rose theme; CRLF (no `sed -i`); pnpm; test-first with red/green counts; CI-equivalent checks; no secrets/PHI anywhere; one PR per user message.
4. **Who does what**: user commits/pushes/PRs/deploys; the agent gives a "Run this" block: branch, `git add -- <paths>`, expected `--cached --stat` line, `git commit -F` from `C:\Users\githu\AppData\Local\Temp\shh-codex\commit-<name>.txt`, push, compare URL, PR body file; after merge `ssh azureuser@smarthealth-hub.japaneast.cloudapp.azure.com` → `bash /opt/smarthealth-hub/scripts/deploy.sh` on the server; checks (`curl.exe -s …/health`, System Health version); local run commands (Redis WSL 6380, uvicorn 8000, celery worker `-P solo` sends real SMS, beat, `pnpm dev`, Docker test DB).

## Appendix B: Deactivate / Archive API quick reference (as of `d6d5977`)

| Method + path | Roles | Body | Success | Errors | Audit |
|---|---|---|---|---|---|
| `POST /api/v1/patients/{id}/deactivate` | admin | `{"reason": "5..1000 chars"}` | 200 PatientResponse (`is_active=false`, `deactivated_*`) | 404, 409 already inactive, 422 reason | DEACTIVATE `{patient_code, reason}` |
| `DELETE /api/v1/patients/{id}` (legacy) | admin | — | 204 | 404, 409 | DEACTIVATE `{patient_code, reason: null}` |
| `POST /api/v1/patients/{id}/reactivate` | admin | — | 200 PatientResponse | 404, 409 already active | REACTIVATE `{patient_code, previous_reason}` |
| `GET /api/v1/patients/inactive?q&page&page_size` | admin, physician | — | 200 `{items, total, page, page_size}` | 403 others | VIEW_PHI `patient_inactive_list` |
| `POST /api/v1/patients/{id}/archive` | admin | `{"reason": "5..1000"}` | 200 | 404, 409 | ARCHIVE |
| `POST /api/v1/patients/{id}/unarchive` | admin | — | 200 | 404, 409 | UNARCHIVE |
| `GET /api/v1/patients/archived` | admin, physician | — | 200 | 403 | VIEW_PHI `patient_archive_list` |

## Appendix C: Manuscript sentences suggested to the user (adapt freely)

1. Charts: *"Charts on the analytics dashboard are rendered with Recharts, a React charting library."*
2. PDFs: *"Printable health cards and patient summaries are generated server-side by WeasyPrint, which renders HTML/CSS templates into PDF."* (Do not claim WeasyPrint for report exports: they are CSV.)
3. Sign-in: *"Staff authenticate with a password and a one-time code delivered by email (MFA). As an alternative, staff may sign in with a passkey (FIDO2/WebAuthn) that uses the device's biometric or PIN."* (OTP is email, not SMS; SMS is only for patient reminders.)
4. Web workers: *"QR decoding and CSV export run in browser Web Workers (via Comlink), keeping the interface responsive on low-end devices."* (Only these two are wired.)
5. OTP subject: the code is first in the subject so Android/Gmail offer one-tap Copy; trade-off: visible in notification previews; mitigations: 10-minute expiry, useless without the password, never logged.

## Appendix D: Exact UI strings added in #64 (for wording changes or tests)

| Where | Text |
|---|---|
| Deactivate dialog title | "Deactivate {name}?" |
| Dialog body | "**Nothing is deleted.** The patient leaves the patient list and search, gets no SMS reminders and can't be booked until they are switched back on." / "You can reactivate them any time from **Inactive Patients**." |
| Dialog field | "Reason *" (placeholder "e.g. Test record, registered twice by mistake, patient asked to stop for now"); hint "At least 5 characters. Storing an old record away instead (moved away, transferred)? Use **Archive**." |
| Dialog button | "Deactivate patient" / "Deactivating..." |
| Toasts (patient page) | "Patient deactivated. Nothing was deleted." / "Patient is active again." / "Could not reactivate the patient. Please try again." |
| Banner heading | "This patient is inactive" + " since {Nov 22, 2026}" + " (by {name})"; "Reason: …"; "Nothing was deleted. Inactive patients are hidden from the patient list and search and get no SMS reminders." + link "All inactive patients" (Admin) |
| Banner button | "Reactivate patient" / "Reactivating..." |
| Inactive page | title "Inactive Patients"; explainer "**Deactivated** patients are switched off for now … Nothing is deleted. Reactivate switches them back on." / "**Archived** patients are old records stored away (moved, transferred, duplicate). They are on the Patient Archive."; empty "No inactive patients."; old rows "Not recorded"; chip "Also archived"; row button "Reactivate" (aria-label "Reactivate {name}"); dialog "Reactivate {name}?" + "Yes, reactivate"; notice "{name} is active again."; denied "Only Admins and Physicians can view inactive patients." |
| Archive page | "Looking for a deactivated patient? Inactive Patients" |
| Resend refusals | "The patient record is missing." / "The patient is inactive. Reactivate them on the Inactive Patients page first." / "The patient is archived. Restore them from the Patient Archive first." |

## Appendix E: Frontend tests added in #64 (`tests/components/PatientDeactivation.test.tsx`)

- Deactivate dialog: says nothing is deleted and that it can be undone; needs a reason of at least 5 characters (button disabled for "" and "abc", enabled for "  Test record  ", calls `onConfirm("Test record")`).
- Inactive banner: shows when/who/why + Reactivate for Admin; no button for other roles and no "since" for old records.
- Hooks: `useDeactivatePatient` → `apiFetch("/patients/p1/deactivate", {method:"POST", body: JSON.stringify({reason})})`; `useReactivatePatient` → `apiFetch("/patients/p1/reactivate", {method:"POST"})`.
- Inactive page: lists rows incl. "Not recorded"; reactivates after confirmation (POST + notice); physician sees no Reactivate; bhw sees the denied message and **no** fetch.
- Mocks: `@/lib/api-client` (`apiFetch: vi.fn()` routed by path/method), `@/hooks/useAuth` (`useCurrentUser` with a mutable `role`).
- `tests/lib/navigation.test.ts`: admin + physician "Patient Care" = Patients, Appointments, Immunizations, Health Cards, Patient Archive, **Inactive Patients**; `/patients/inactive` highlights only itself.

## Session Closed
**Closed at:** 2026-11-22 (Manila, UTC+8), after #64 was merged (`d6d5977`, CI green) and its backend routes were confirmed live in production OpenAPI
**Commit:** the `session: inactive-patients-live [standalone-9d299342]` commit on branch `docs/handoff-seq14` that includes this note (run by the user from the commands Claude provided; merge via PR, docs only, no server update needed)
**Session status:** Handed off to next session
