# Phase 10 (admin role model B) and the NFC allergies fix are DONE, deployed and verified by the user; the roadmap phases are complete

**Date:** 2026-11-19
**Status:** COMPLETED (Phase 10). No phase is in progress. Only user-side open items and optional work remain.
**Bead(s):** none (`bd` CLI not installed on this PC)
**Epic:** Deploy SmartHealth Hub to production and harden it (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `5`
**Parent:** `HANDOFF_phase9-system-health-done_2026-11-19.md`
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > `HANDOFF_nfc-backups-done_2026-11-19.md` > `HANDOFF_phase9-system-health-done_2026-11-19.md` > this

> ⚠️ This repo is **PUBLIC**. This file deliberately contains no passwords, keys,
> email addresses, phone numbers, TextBee device IDs, NFC signatures or chip serial
> numbers. Never add them.

---

## Stale References

- `_PHYSICIAN_PLUS` (parent: `immunizations.py:54`, used at `:221`): **removed on purpose**, replaced by `_PHYSICIAN_ONLY` (`:56`, used at `:223`).
- Parent line anchors that shifted (code still there): `medical_history.py` `_CLINICAL :51 → :57`, `_PHI_READ :53 → :60`, `include_notes :326 → :336`; `history/page.tsx canEdit :88 → :89`; `[patientId]/immunizations/page.tsx canDelete :198 → :199`; `[patientId]/page.tsx isAdmin :211` area → `canAddVisit :213`.
- `VisitEditModal.tsx` `canSeePhi` still exists (`:54`), but it is now `canAccessClinicalPhi(currentUser?.role)`, not `physician || admin`.

## Since Last Handoff

- **Parent step 1 (housekeeping)**: DONE. Local `main` was fast-forwarded to `93a00a1`, then `feat/system-health` and `docs/handoff-phase9` were deleted. `README.md` (the user's own edit) and `stash@{0}` were left alone.
- **Parent step 2 (user items: SIM, chip, demo PDFs)**: partly done. The **school-ID chip question is resolved for testing**: the user verified the NFC page with a freshly registered patient (see below). The gateway SIM is still not loaded (not mentioned again this session). Printed demo card PDFs were not regenerated.
- **Parent step 3 (Phase 10)**: DONE. Claude asked the 3 decisions with a recommendation each, and the user replied **"go, all defaults"**: (1) allergies/known conditions stay visible to all staff; (2) immunization DELETE is physician only; (3) no break-glass override. Merged as **PR #23** (merge `dd7b67d`: commits `fa9f18a` fix(nfc) + `b623b90` feat(rbac)). Deployed with `deploy.sh` and verified in the browser by the user.
- **Parent step 4 (local DB tests)**: DONE, the hard way. The user started Docker Desktop, but about 55 containers from other projects auto-started with it and overloaded the engine (500 errors, then the engine stopped). After the user ran `docker stop $(docker ps -q)`, the **full backend suite passed locally: 299 tests, 0 failures, 0 errors**.
- **Parent Open Questions 1–3**: answered (defaults, above). **OQ 4 (SIM)**: still open. **OQ 5 (retention test)**: still open, harmless.
- **New finding (not in the parent)**: **NFC allergies bug**. `patients.allergies` is stored AES-256-GCM encrypted, but the public NFC view page and the relay monitor printed the raw ciphertext. It was fixed in a separate commit and verified by the user ("allergies show plain text").
- **New finding**: a **second** immunizations page (`app/(dashboard)/immunizations/page.tsx`, the sidebar one) also let admin delete. The parent only listed the per-patient page. Both are now gated.
- **Parent handoff committed**: it was merged as **PR #24** (commit `4c366bc`, merge `3ac073b`). The server now runs `3ac073b`.
- **Trajectory**: the roadmap order NFC → backups → System Health → admin model B is **complete**. Only optional items and the user's operational to-dos remain.

## Reference Documents

- `CLAUDE.md`: project conventions. **Changed this session**: new Key Conventions bullet "Admin role model B" (line ~38), and a note that allergies/known_conditions are encrypted and must be decrypted before display.
- `DEV-WORKFLOW.md`: §5 has the throwaway Docker test containers (used this session, worked once Docker was healthy), §6 deploys with `deploy.sh`, §9 has the job times, §11 has troubleshooting.
- `plans/handoffs/HANDOFF_azure-go-live_2026-11-18.md` (seq 2): **Post-Close Additions §C** was the Phase 10 change list. It is now fully implemented, so it's historical only.
- `plans/handoffs/HANDOFF_phase9-system-health-done_2026-11-19.md` (parent): System Health design, secret rotation, job schedule.
- `.claude/agents/smarthealth-hub-architect.md`: **local only (not in git)**. Its RBAC matrix §11 rows were updated for model B this session.
- Claude memory: `deployment_setup.md` (Phase 10 DONE paragraph added), `feedback_no_secret_screens.md`, `pnpm_not_npm.md`, `project_scaffold.md`.

## The Goal

SmartHealth Hub (thesis project: Barangay Health Center records system with NFC/QR health cards, SMS reminders, OTP MFA) runs in production. The website is `https://smarthealth-hub-two.vercel.app` (Vercel) and the API is `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose). The hardening roadmap for real use and the thesis defense is now complete: Phase 7 NFC ✅, Phase 8 backups ✅, Phase 9 System Health ✅, **Phase 10 admin role model B ✅**. Model B means the admin runs the system (users, audit log, settings, System Health, backups, patient demographics, appointments, SMS, health cards) but **never reads decrypted clinical PHI and never makes clinical edits**. The next sessions are about defense readiness (SIM, chip, demo data) and optional extras.

## Where We Are

- **Production**: the server runs commit **`3ac073b`** (user saw `OK: commit 3ac073b is running.` from `deploy.sh`). This includes Phase 10 and the PR #24 handoff note.
- **User's browser checks after deploy: all passed** ("all checks passed"):
  - Admin: no "+ Add Visit" on the patient page or the history page. No "Edit" on visit rows. `/visits/new` shows the "can't log visits" message. Immunizations show "Edit" but **no "Delete"** on both pages.
  - Physician: all of the above controls are present.
- **NFC allergies check: passed** ("NFC check passed, allergies show plain text"). It was tested with a newly registered test patient (suggested name "Test NFC", allergies "Penicillin, Shrimp"), because **no `seed_db.py` demo patient has allergies**.
- **Backend guards now** (`backend/app/api/v1/endpoints/medical_history.py`):
  - `_CLINICAL = require_role("physician", "bhw")` at `:57`, used at `:104` (POST `/patients/{id}/visits`).
  - `_PHI_READ = require_role("physician")` at `:60`, used at `:146`, `:181` and `:260` (GET/PUT full visit, POST medical history).
  - `_NOTES_ROLES: frozenset[str] = frozenset({"physician"})` at `:62`. `include_notes = current_user.role.name in _NOTES_ROLES` at `:336`.
- **Immunizations** (`backend/app/api/v1/endpoints/immunizations.py`): `_BHW_PLUS = require_role("bhw", "physician", "admin", "admin_staff")` at `:51` (unchanged, used for list/create/PATCH). `_PHYSICIAN_ONLY = require_role("physician")` at `:56`, used at `:223` (DELETE).
- **NFC allergies** (`backend/app/api/v1/endpoints/health_cards.py`): helper `_patient_allergies(patient) -> str | None` at `:212`, used in `_render_nfc_view_html` at `:353` and in the relay-monitor cache entry at `:1217` (`or "None on record"`).
- **Frontend**: new `frontend/web/lib/permissions.ts` with `canAccessClinicalPhi` (physician), `canLogVisit` (physician, bhw) and `canDeleteImmunization` (physician). All three return `false` for `null`/`undefined` (user still loading).
- **Unchanged on purpose**: `patients.py:127-129` (allergies/known_conditions decrypted for all staff, per decision 1), `patients.py:541` archive list (`admin`, `physician`), archive/deactivate buttons on `[patientId]/page.tsx` (admin), `GET /patients/{id}/summary` PDF (`patients.py:~744`, all roles, but it loads only vitals and demographics, no diagnosis or notes).
- **Tests**: full local backend run **299 passed** (exit 0, log `pytest-full.log`). Frontend vitest **16 passed** (4 new). `tsc` 0 errors.
- **CI on PR #23**: not checked by Claude (`gh` CLI not installed). The user merged it, so presumably green.
- **PC repo**: `main` matches `origin/main` at `3ac073b` **only if the user ran** `git pull` + `git branch -d docs/handoff-phase10` (Claude gave the commands. When last checked, local HEAD was `dd7b67d` and the local branch `docs/handoff-phase10` still existed).
- **Uncommitted on the PC (never commit without asking)**: `README.md` (user's `ssh azureuser@…` line around line 134), `backend/celerybeat-schedule-shm`, `backend/celerybeat-schedule-wal`, `START.md`, `dump.rdb`, `start-tunnel.ps1`.
- **`stash@{0}`** (`WIP on main: d041507 feat(dashboard): add error boundary and loading states…`) still exists. Not from this chain. Don't drop it.
- **Remote branch `origin/docs/handoff-update`** still exists from an earlier session. Not this chain's. Left alone, and the user was told they may delete it.
- **Docker on the PC**: all of the user's other projects' containers (52 IDs stopped) are **still stopped**. The test containers `shh-test-pg`/`shh-test-redis` were stopped and auto-removed (`--rm`).
- **Claude memory updated**: `deployment_setup.md` has a "Phase 10 DONE 2026-11-19" paragraph.

## What We Tried (Chronological)

1. **Onboarding (read-only)**: `bd` not installed. Production `/health` returned `ok`. Read the parent, grandparent §C, `medical_history.py`, `immunizations.py`, `patients.py`, `require_role`, every frontend role check, the visit schema and the test files. All of the parent's file:line anchors still matched. Found 3 things the parent missed: the second immunizations page with admin delete (`immunizations/page.tsx:462`); the "Download Summary" PDF is safe (no PHI); and the suspected NFC allergies ciphertext bug (`patient_service.py:354` encrypts; `health_cards.py:339` and `:1202` printed raw).
2. **Decisions**: asked all 3 in one message, recommendation first (keep allergies visible; physician-only delete; no break-glass). The user replied **"go, all defaults"**.
3. **Housekeeping**: `main` → `93a00a1`, deleted `feat/system-health` and `docs/handoff-phase9`, created `feat/admin-model-b`.
4. **Tests first (TDD)**: wrote the admin-403 tests for visits before changing guards, then the medical-history and immunization tests. A Grep with a brace glob didn't match, so each file was searched directly. In `test_immunizations.py`, the variable `adm_token` was renamed to `phys_token` where it now holds a physician token (audit-log, not-found and delete-then-not-visible tests).
5. **Backend guard changes**: `_CLINICAL`, `_PHI_READ`, `_NOTES_ROLES`, and `_PHYSICIAN_ONLY` replacing `_PHYSICIAN_PLUS`. Docstrings and OpenAPI descriptions were updated ("Physician only"; redaction lists Admin/BHW/admin_staff) in `schemas/medical_history.py`, `services/medical_history_service.py`, `models/visit.py` and `schemas/visit.py`.
6. **Frontend**: `permissions.ts` + test; `VisitEditModal.tsx` (`canSeePhi` → `canAccessClinicalPhi`); `history/page.tsx` (`canEdit`, and a new `canAdd` that hides "+ Add Visit"); `[patientId]/page.tsx` (`canAddVisit` gates the PanelHeader action); `visits/new/page.tsx` (a role that can't log visits gets a message + link back to history instead of a form that would 403); both immunization pages' `canDelete`. Discovered that admin_staff could previously fill in the whole new-visit form and only get an error on save; that is now fixed by the same gate. There is **no medical-history UI** in the frontend, so nothing to hide there.
7. **Allergies bug**: confirmed no test covered it. Checked `decrypt_text` on bad input: it **returns non-encrypted / invalid input unchanged**, so legacy plaintext rows can't crash the public NFC page. Added the `_patient_allergies` helper and 3 DB-free tests. The first test asserts the stored value is *not* the plaintext, which proves the old page printed ciphertext.
8. **Local checks (no DB)**: ruff check/format and mypy on `backend/app` passed; `test_nfc_allergies.py` 3 passed; `tsc` 0 errors; eslint on changed files 0 errors (2 pre-existing CSS-class warnings on untouched lines); vitest 16 passed. The three older test files already had ruff I001/F401 + format findings **on `main`**. This was confirmed with a temporary stash/pop (`stash@{0}` verified intact afterwards). CI lints only `backend/app`, so they were left alone.
9. **Docs**: `CLAUDE.md` bullet; local architect-agent RBAC matrix.
10. **Commits by the user** via `git commit -F` with `commit2.txt` (fix(nfc), first) and `commit1.txt` (feat(rbac)), then PR #23 with `pr-body.md`. Merged.
11. **Local DB test run attempt 1** (user: "my Docker is currently open and running, so test it the local database"): started `shh-test-pg` (postgres:18-alpine, 127.0.0.1:5499) and `shh-test-redis` (redis:7-alpine, 127.0.0.1:6399). The first background run, piped through `Select-Object`, looked hung with zero DB connections. It was stopped (TaskStop + killed PID 8500) and rerun writing to a log file.
12. **Result of the log run**: **76 passed, 14 errors in 1291.99 s (21:31)**. Every error was `TimeoutError` in `conftest.py:170 db_session` (asyncpg connect hanging 60 s in `_create_ssl_connection`). The errors came in bursts: 2 visits, 5 medical_history, 7 immunizations. The user asked "its still not done?" mid-run.
13. **Rerun of the 14 node IDs**: **14 errors in 159.76 s**, now at `conftest.py:132 db_tables` (TimeoutError). `docker exec`/`docker ps` returned `500 Internal Server Error`, while a raw TCP connect to 127.0.0.1:5499 succeeded in 89 ms. **Cause: Docker Desktop overloaded by ~55 auto-started containers** from other projects (agap_*, ascendra-*, supabase_*, infra-*, deadapp-*, server-postgres-1, shh-verify-*). Claude did not touch them and asked the user.
14. **User tried `docker compose stop`** in `C:\Users\githu\Music\agap-emergency` → `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`. Claude checked: no Docker Desktop processes, `wsl -l -v` shows `docker-desktop  Stopped`. The engine had died.
15. **Clean restart**: the user started Docker Desktop and immediately ran `docker stop $(docker ps -q)` (52 container IDs), then `docker ps` was empty. Claude restarted the two test containers (`pg ready after 7 tries`) and ran the **whole** suite: `python -m pytest -q -p no:cacheprovider` → **exit 0, 299 dots, no F/E**. The final summary line was missing from the log (the 299 count comes from the progress dots: 4×72 + 11). The test containers were then stopped.
16. **Handoff commit verified**: `git fetch --prune` showed `3ac073b Merge pull request #24`, `4c366bc` touching only the handoff file (394 insertions). Uncommitted files and stash intact. The user was given `git pull` + `git branch -d docs/handoff-phase10`.
17. **Deploy**: the user asked where to run `deploy.sh` (prompt `azureuser@smarthealth-server:~$`). Claude read `scripts/deploy.sh` (it `cd`s to its own repo root, warns on a non-main branch, `git pull --ff-only`, `up -d --build --wait --wait-timeout 300`) and confirmed. The user reported `OK commit 3ac073b is running`.
18. **Browser verification guide**: exact controls per page (labels "+ Add Visit", "Edit", "Delete"; URLs `/patients/<id>/history`, `/visits/new`, `/immunizations`; sidebar Immunizations), as admin then as physician. The user reported all checks passed.
19. **NFC verification**: explained the chip still holds a pre-rotation link (→ 403) and gave the rewrite process: phone browser → Health Cards → card `SH-2026-000001` → View / Print → green "NFC Tools Task URL" box → Copy → NFC Tools: Write → Add a record → URL/URI → Write.
20. **"Give me a demo user that has allergies"**: grep found **no allergies in the seed scripts** (`seed_db.py` none; `reset_and_seed.py` only has a chief complaint mentioning "allergic"; `tests/seed_intake_test_data.py` has `known_allergies: "Penicillin"` on an intake form, which is not a patient). A **read-only SSH psql query** listing which patients have allergies was **denied by the auto-mode classifier ("Unauthorized Access")**. Claude did not retry and instead gave steps to register a test patient with allergies (form step 3 "Allergies" textarea, `patients/new/page.tsx:704`, tick "Generate Health Card"). Opening the copied NFC URL in a browser is equivalent to a chip tap. The user then reported plain text. ✅

## Key Decisions

- **Allergies / known conditions stay visible to all staff** (decision 1). Why: BHWs give vaccines and need allergies; the register/edit forms contain these fields, so hiding them would break editing for BHW, admin staff and admin. Rejected: physician-only.
- **Immunization DELETE is physician only; PATCH stays for admin/BHW/physician/admin_staff** (decision 2). Why: a hard delete of a dose that was given causes wrong next-due reminders, which is a clinical act. Data-entry corrections remain possible through edit. Rejected: keep admin on delete.
- **No break-glass override for admin** (decision 3). Why: the clinic has a physician account. "Admin can't read clinical data, and the audit log proves it" is easier to defend in the thesis than an override with its own UI and tests. Listed as future work.
- **Logging a new visit: physician + BHW**, admin removed. BHWs record vitals in the field. Admin staff were already excluded.
- **Medical-history single entry for admin: redacted** (`notes=None, redacted=True`), like BHW/admin_staff, instead of 403. The entry itself (condition name etc.) is not clinical-note PHI.
- **Archive list, archive/deactivate buttons, summary PDF unchanged**: administrative tasks; the PDF has no diagnosis/notes.
- **Frontend helpers in one file (`lib/permissions.ts`)**, each documenting the backend guard it mirrors. The backend stays authoritative. The vitest suite pins the role lists so a drift shows up in tests.
- **The allergies fix went in a separate commit** (`fa9f18a`) before the RBAC commit, so it can be reverted or reviewed alone.
- **The NFC fix decrypts in one helper** and relies on `decrypt_text`'s pass-through for legacy plaintext. Rejected: a data migration to re-encrypt or normalize old rows (unneeded).
- **The other projects' Docker containers are the user's call**: Claude did not stop them itself. It explained the 500s and let the user run `docker stop $(docker ps -q)`.
- **Test data for NFC: register a new patient** rather than query production. The read-only query was denied anyway, and a patient registered through the app is the realistic (encrypted) case.

## Evidence & Data

### Commit log (this session)
| Hash | Branch | Summary |
|---|---|---|
| `fa9f18a` | feat/admin-model-b | fix(nfc): show decrypted allergies on the NFC view and relay monitor (2 files, +50/−2) |
| `b623b90` | feat/admin-model-b | feat(rbac): admin role model B - admin loses clinical PHI access (18 files, +356/−100) |
| `dd7b67d` | main | Merge PR #23 (feat/admin-model-b) |
| `4c366bc` | docs/handoff-phase10 | session: phase9-system-health-done [standalone-9d299342] (1 file, +394) |
| `3ac073b` | main | Merge PR #24: **deployed on the server** |

### Access matrix after Phase 10 (from the PR body)
| Action | Admin | BHW | Physician | Admin Staff |
|---|:-:|:-:|:-:|:-:|
| Visit list / medical-history list (no PHI) | ✅ | ✅ | ✅ | ✅ |
| Log a new visit | ❌ (was ✅) | ✅ | ✅ | ❌ |
| View / edit diagnosis + treatment notes | ❌ (was ✅) | ❌ | ✅ | ❌ |
| Add medical history | ❌ (was ✅) | ❌ | ✅ | ❌ |
| Medical-history notes on a single entry | redacted (was decrypted) | redacted | ✅ | redacted |
| Delete immunization record | ❌ (was ✅) | ❌ | ✅ | ❌ |
| Edit immunization record | ✅ | ✅ | ✅ | ✅ |
| Allergies / known conditions | ✅ | ✅ | ✅ | ✅ (unchanged) |

### Guard changes (before → after)
| File:line (now) | Before | After |
|---|---|---|
| `medical_history.py:57` `_CLINICAL` | `("physician", "bhw", "admin")` | `("physician", "bhw")` |
| `medical_history.py:60` `_PHI_READ` | `("physician", "admin")` | `("physician")` |
| `medical_history.py:62/336` notes | `role in ("physician", "admin")` | `_NOTES_ROLES = frozenset({"physician"})` |
| `immunizations.py:56/223` DELETE | `_PHYSICIAN_PLUS = ("physician", "admin")` | `_PHYSICIAN_ONLY = ("physician")` |
| `VisitEditModal.tsx` `canSeePhi` | physician \|\| admin | `canAccessClinicalPhi` |
| `history/page.tsx:89-90` | `canEdit` physician \|\| admin; Add always shown | `canAccessClinicalPhi` / `canLogVisit` |
| `[patientId]/page.tsx:213` | "+ Add Visit" always shown | `canLogVisit` |
| `[patientId]/immunizations/page.tsx:199` | physician \|\| admin | `canDeleteImmunization` |
| `immunizations/page.tsx:463` | included admin | `canDeleteImmunization` |
| `visits/new/page.tsx:101` | form for everyone | message if `!canLogVisit` |

### Test run history (local, PC)
| Run | Scope | Result | Time | Cause / note |
|---|---|---|---|---|
| DB-free | `test_nfc_allergies.py` | 3 passed | — | before commit |
| vitest | frontend | 16 passed (4 new) | — | before commit |
| #1 piped through Select-Object | 4 files | looked hung, 0 DB connections | — | stopped (TaskStop + kill PID 8500) |
| #2 log file | visits, medical_history, immunizations, nfc_allergies (90) | **76 passed, 14 errors** | 1291.99 s | asyncpg connect timeouts; Docker overloaded |
| #3 rerun of the 14 | 14 node IDs | **14 errors** | 159.76 s | `conftest.py:132 db_tables` TimeoutError; engine 500s |
| #4 after `docker stop $(docker ps -q)` | **whole backend suite** | **299 passed**, exit 0 | — | clean Docker |

### The 14 tests that errored in runs #2/#3 (all passed in run #4)
```text
test_visits.py::test_update_visit_physician_can_update            (new)
test_visits.py::test_update_visit_admin_forbidden                 (new)
test_medical_history.py::test_create_medical_history_encrypts_notes
test_medical_history.py::test_create_medical_history_notes_returned_decrypted_in_response
test_medical_history.py::test_create_medical_history_writes_audit_log
test_medical_history.py::test_create_medical_history_invalid_severity_returns_422
test_medical_history.py::test_create_medical_history_missing_condition_name_returns_422
test_immunizations.py::test_list_immunizations_bhw_can_list
test_immunizations.py::test_list_immunizations_empty_for_new_patient
test_immunizations.py::test_list_immunizations_returns_created_record
test_immunizations.py::test_list_immunizations_pagination
test_immunizations.py::test_create_immunization_success
test_immunizations.py::test_create_immunization_unauthenticated_returns_401
test_immunizations.py::test_create_immunization_writes_audit_log
```

### Warnings in the 299-test run (pre-existing, not from Phase 10)
| Source | Warning |
|---|---|
| `app/core/exceptions.py:118` | `HTTP_422_UNPROCESSABLE_ENTITY` deprecated → `HTTP_422_UNPROCESSABLE_CONTENT` |
| passlib argon2 handler | `argon2.__version__` deprecated |
| `immunization_service.py:193`, `patient_service.py:457/491`, `visit_service.py:179` | `datetime.utcnow()` deprecated |

### Local verification results (before commit)
| Check | Result |
|---|---|
| `ruff check backend/app` / `ruff format --check backend/app` | pass |
| `mypy app --ignore-missing-imports` | pass |
| `ruff` on the 3 older test files | I001/F401 + format findings, **pre-existing on `main`** (not CI-linted) |
| `tsc --noEmit` | 0 errors |
| eslint on changed files | 0 errors, 2 pre-existing warnings (CSS class string) |

### Post-deploy verification (user, browser + phone)
| Check | Result |
|---|---|
| `deploy.sh` | `OK: commit 3ac073b is running.` |
| Admin: patient page "+ Add Visit" | hidden ✅ |
| Admin: `/history` "+ Add Visit" + row "Edit" | hidden ✅ |
| Admin: `/visits/new` | message instead of form ✅ |
| Admin: both immunization pages | "Edit" shown, "Delete" hidden ✅ |
| Physician: same pages | all controls shown ✅ |
| NFC view, test patient with allergies | plain text ✅ |

### Docker incident timeline (PC)
| Step | Observation |
|---|---|
| Docker Desktop started by the user | ~55 containers of other projects auto-started |
| Run #2 | connects hang 60 s in asyncpg `_create_ssl_connection` in bursts |
| `docker ps` / `docker exec` | `request returned 500 Internal Server Error for API route…` |
| TCP 127.0.0.1:5499 | connects in 89 ms (port forward alive, engine not) |
| user `docker compose stop` | `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified` |
| `wsl -l -v` | `docker-desktop Stopped`, Ubuntu Running |
| restart + `docker stop $(docker ps -q)` | 52 IDs stopped, `docker ps` empty |
| test containers | `pg ready after 7 tries`, full suite green |

### DEV-WORKFLOW §5 commands used (PowerShell, PC; test-only throwaway credentials)
```powershell
docker run -d --rm --name shh-test-pg -e POSTGRES_USER=shh_test -e POSTGRES_PASSWORD=shh_test -e POSTGRES_DB=smarthealthhub_test -p 127.0.0.1:5499:5432 postgres:18-alpine
docker run -d --rm --name shh-test-redis -p 127.0.0.1:6399:6379 redis:7-alpine
cd backend
$env:DATABASE_URL="postgresql+asyncpg://shh_test:shh_test@127.0.0.1:5499/smarthealthhub_test"; $env:REDIS_URL="redis://127.0.0.1:6399/0"; python -m pytest -q
docker stop shh-test-pg shh-test-redis
```

### Consolidated failed approaches (don't repeat)
| Attempt | Error / outcome | Lesson |
|---|---|---|
| Running local DB tests with all other projects' containers up | asyncpg TimeoutError, engine 500, engine died | `docker stop $(docker ps -q)` first (user's call) |
| Piping a long pytest through `Select-Object` in background | no output, looked hung | redirect to a log file |
| `docker compose stop` after the engine died | pipe not found | restart Docker Desktop first |
| Grep with a brace `glob` (`{a,b}`) in this repo | no matches | search per file / per path |
| `gh pr view` for CI status | `gh` not installed | ask the user to look at the PR checks |
| Read-only SSH `psql` on production for patients with allergies | denied by classifier ("Unauthorized Access") | register a test patient instead; don't query prod PHI tables |
| Final pytest summary line | missing from `pytest-full.log` | trust exit code + progress dots, or add `-rA`/`--junitxml` next time |

### Timeline (user prompt → outcome)
| # | User said | Outcome |
|---|---|---|
| 1 | read seq-4 handoff, onboard, wait | onboarding report + 3 decisions + plan |
| 2 | "go, all defaults" | housekeeping, Phase 10, NFC fix, local checks, commit files + PR body |
| 3 | "Pull request successfully merged … commit the handoff … Docker is open, test it the local database" | handoff commit commands; test containers; run #2 |
| 4 | "its still not done?" | progress (48/90), then 76/14 report, Docker diagnosis |
| 5 | `docker compose stop` error | engine stopped; restart + stop-all steps |
| 6 | `docker stop $(docker ps -q)` output, `docker ps` empty | full suite: 299 passed |
| 7 | "I'm done with this: Handoff commit … verify first" | verified PR #24 / `4c366bc` / `3ac073b` |
| 8 | "this is where i should run it? azureuser@smarthealth-server:~$" | yes + what success/failure look like |
| 9 | "deploy done, OK commit 3ac073b … where can i verify" | page-by-page admin/physician checklist |
| 10 | "all checks passed … give me the process for … NFC" | chip rewrite + test process |
| 11 | "give me a demo user that has an allergies" | none in seed; register a test patient |
| 12 | "NFC check passed, allergies show plain text" | Phase 10 closed; memory updated |
| 13 | "/handoff" | this file |

### Data / scratch files (session scratchpad, may be cleared on reboot)
`C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\dbf74d55-c8d5-4a73-8196-8189dde2f149\scratchpad\`:
- `commit1.txt` (feat(rbac) message), `commit2.txt` (fix(nfc) message), `commit-handoff.txt`, `pr-body.md` (PR #23 body)
- `pytest-phase10.log` (run #2: 76 passed / 14 errors), `pytest-rerun.log` (run #3), `pytest-full.log` (run #4: 299 dots)
- `assist-text.txt` (transcript extract used for this handoff)

## Code Analysis

- **`decrypt_text`** (`backend/app/utils/encryption.py`): returns non-encrypted or invalid input **unchanged** (graceful). That makes it safe on the public NFC page for legacy plaintext rows. `encrypt_text` produces base64 AES-256-GCM.
- **Write path**: `patient_service._encrypt_optional_text` encrypts `allergies` and `known_conditions` on every create/update (`patient_service.py:~354`). `patients.py:127-129` decrypts for responses.
- **Three different "allergies" sources in `health_cards.py`**, which is a remaining inconsistency:
  - `patients.allergies` (decrypted via `_patient_allergies`) is used by the NFC view page (`:353`) and the `/view` relay cache (`:1217`).
  - **`medical_histories.condition_name` joined with ", "** is used by the card PDF/print data (`:1587-1597`, `:2156-2165`) and by the UID scan endpoint `_scan_nfc_uid_impl` (`:2839-2843`).
  - So the printed card and a UID scan can show different "allergies" from the URL tap view. Not changed this session (see Open Questions).
- **Empty-state wording differs**: the NFC view HTML shows `None recorded.` (`:357`), the monitor/scan payloads show `None on record`.
- **`require_role(*roles)`** (`backend/app/core/security.py`) is a FastAPI dependency. Role names: `admin`, `physician` (Physician/Nurse/Midwife), `bhw`, `admin_staff`.
- **Test fixtures**: `conftest.py` has a SAVEPOINT-per-test `db_session` (`:170`) and a session-scoped `db_tables` (`:132`). The test DB URL is derived from `DATABASE_URL` by regex-replacing the last path segment with `/smarthealthhub_test`, so a query string like `?ssl=disable` would be stripped. Token fixtures include `admin_token`, `bhw_token` and a physician user/token (`physician_user`).
- **Frontend gating pattern**: pages read `currentUser?.role` and call the helper. During loading the role is `undefined` → helpers return `false` (buttons appear only after the user loads).
- **Patient registration form**: `patients/new/page.tsx` step 3 holds `allergies` (`:704-705`) and `knownConditions`; there is a "Generate Health Card" option at `:741`. **There is no edit form for allergies on existing patients in the frontend** (grep found allergies only in register/intake/review/preview components).
- **NFC print page**: `health-cards/[patientId]/print/page.tsx` `NfcUrlHint` (`:43`) shows the backend-provided `card.nfc_view_url` with a Copy button (`:451`, `:550`). The "Generate Health Card" button appears when no real card exists (`:332-366`).
- **`deploy.sh`** (`scripts/deploy.sh`): `cd "$(dirname "$0")/.."`, asks before a non-`main` branch, `git pull --ff-only`, exports `GIT_COMMIT=$(git rev-parse --short HEAD)`, `compose up -d --build --wait --wait-timeout 300`, prints `OK: commit … is running.` or `FAILED…` + log hint.

## Files Changed

### Source code: fix(nfc) `fa9f18a`
- `backend/app/api/v1/endpoints/health_cards.py`: `from app.utils.encryption import decrypt_text`; `_patient_allergies()`; used in the NFC view HTML and the relay monitor.

### Source code: feat(rbac) `b623b90`
- `backend/app/api/v1/endpoints/medical_history.py`: guards + "SECURITY (admin role model B)" module-docstring section; route summaries "Physician only".
- `backend/app/api/v1/endpoints/immunizations.py`: `_PHYSICIAN_ONLY` on DELETE; docstring RBAC line.
- `backend/app/schemas/medical_history.py`, `backend/app/services/medical_history_service.py`, `backend/app/models/visit.py`, `backend/app/schemas/visit.py`: wording only (Physician; redaction for Admin/BHW/admin_staff).
- `frontend/web/lib/permissions.ts`: **new**.
- `frontend/web/components/modals/VisitEditModal.tsx`: `canAccessClinicalPhi`.
- `frontend/web/app/(dashboard)/patients/[patientId]/history/page.tsx`: `canEdit`, `canAdd`.
- `frontend/web/app/(dashboard)/patients/[patientId]/page.tsx`: `canAddVisit`.
- `frontend/web/app/(dashboard)/patients/[patientId]/visits/new/page.tsx`: blocked-role message.
- `frontend/web/app/(dashboard)/patients/[patientId]/immunizations/page.tsx`, `frontend/web/app/(dashboard)/immunizations/page.tsx`: `canDelete`.

### Tests
- `backend/tests/test_nfc_allergies.py` (**new**, DB-free): `test_patient_allergies_decrypts_stored_ciphertext`, `test_patient_allergies_legacy_plaintext_returned_unchanged`, `test_patient_allergies_missing_is_none`.
- `backend/tests/test_visits.py`: `test_create_visit_admin_forbidden` (:402), `test_get_full_visit_admin_forbidden` (:715, replaces the old admin-can-access test), `test_update_visit_physician_can_update` (:748), `test_update_visit_admin_forbidden` (:766), `test_update_visit_bhw_forbidden` (:792).
- `backend/tests/test_medical_history.py`: `test_create_medical_history_admin_forbidden` (:322), `test_get_medical_history_entry_admin_sees_redacted_notes` (:591).
- `backend/tests/test_immunizations.py`: `test_delete_immunization_admin_returns_403` (:618, record still listed afterwards), `test_update_immunization_admin_can_correct_entry` (:644, PATCH batch_number). Audit-log/not-found/then-not-visible delete tests now use `physician_user` / `phys_token`.
- `frontend/web/tests/lib/permissions.test.ts` (**new**, 4 tests): role lists per helper + loading state.

### Docs / config
- `CLAUDE.md`: model B bullet (committed in `b623b90`).
- `.claude/agents/smarthealth-hub-architect.md`: RBAC matrix (local, not in git).
- `plans/handoffs/HANDOFF_phase9-system-health-done_2026-11-19.md`: committed via PR #24.

### Outside the repo
- Production: deployed `3ac073b`. Production data: the user registered a **test patient** (suggested "Test NFC") with allergies and a health card. It may still be active.
- Possibly the school-ID chip: if the user wrote the Test NFC link to it, the chip now points at that patient.
- Claude memory `deployment_setup.md`: Phase 10 DONE paragraph.

## User Feedback & Preferences (REQUIRED)

- **"go, all defaults"**: accepts all recommendations as listed. Keep giving one recommendation per decision with the concrete reason.
- "Pull request successfully merged and closed, give me the command and message to commit and push…": wants **ready-to-run commands + a commit message file** (`git commit -F`). The user commits, pushes, opens and merges PRs themselves.
- "my Docker is currently open and running, so test it the local database": wants local proof, not just CI. Claude should run the §5 containers itself.
- **"its still not done?"**: long silent background runs frustrate the user. Give progress (N of M) and an ETA or a reason when something takes >5 minutes.
- Ran `docker compose stop` in another project folder on their own, then `docker stop $(docker ps -q)` when told. The user is fine stopping their other projects' containers when given the exact command, but it stays **their** call.
- **"verify first"**: after the user does a step, they want Claude to check it (`git fetch`, `git log origin/main`, `git show --stat`) before moving on.
- "this is where i should run it? azureuser@smarthealth-server:~$": confirm **which prompt** a command runs at, every time (PowerShell on PC / server prompt / browser / phone).
- "where can i verify this?": wants **page-by-page click paths** with exact button labels, not general statements.
- "give me the process for … tap the NFC card with a phone": wants step-by-step phone procedures (app names, menu names).
- "give me a demo user that has an allergies": expects Claude to find or produce test data. When none exists, give the fastest way to create it.
- Short confirmations ("all checks passed", "NFC check passed …") = close the item and move on. No re-verification needed.
- Wants `/handoff` at the end of each session and a paste-ready start prompt.
- (Carried) Screenshots everything. Never put secrets in output the user might paste (memory `feedback_no_secret_screens.md`).

## Where We're Going

1. **PC housekeeping (PowerShell on PC)**: `git pull` (→ `3ac073b`) and `git branch -d docs/handoff-phase10` if not done. Optionally delete the remote `docs/handoff-update` on GitHub (user's call). Never commit `README.md`/celerybeat/START/dump/start-tunnel without asking; don't drop `stash@{0}`.
2. **Defense readiness (user items; remind once)**:
   a. Load the gateway SIM, rerun the one-line SMS test (in the parent handoff, Evidence "Server command log"), and confirm the phone shows **sent**.
   b. Write the final defense card link onto the NTAG215 (or rewrite the school ID) from the Print page of the patient to be demoed.
   c. Deactivate the "Test NFC" patient (admin, patient page) once the chip no longer points at it.
   d. Regenerate printed demo card PDFs if their QR codes will be scanned (pre-rotation QR links return 403).
3. **Optional cleanups (ask first)**: the allergies-source inconsistency (card PDF + UID scan use medical-history condition names; the tap view uses `patients.allergies`); unify "None recorded." / "None on record"; replace the `datetime.utcnow()` and `HTTP_422_UNPROCESSABLE_ENTITY` deprecations; fix the ruff findings in the 3 older test files.
4. **Optional from the parent**: automated deploy (GitHub "Deploy" workflow), DEV-WORKFLOW §8 one-setting change pattern, `shh-backuptest` Docker cleanup (`docker compose -p shh-backuptest down -v`), plan a `POSTGRES_PASSWORD`/`ENCRYPTION_KEY` rotation (needs a re-encryption script), UptimeRobot on `/health`, in-app NFC button reading URL records, "Card Not Found" → "Invalid card link", break-glass access (future work, decision 3).
5. **Thesis text**: describe model B (access matrix above) and the audit-log evidence. Mention the not-rotated `POSTGRES_PASSWORD`/`ENCRYPTION_KEY` exposure honestly in the security section.

## Risks & Blockers

- **SMS still fails silently at the carrier** until the gateway SIM is loaded (TextBee says `queued`; System Health stays green).
- **The "Test NFC" patient is in production data** and may appear in demo lists/analytics until deactivated.
- **Allergies shown differently across surfaces** (tap view vs card PDF vs UID scan). A panel member could notice it during the demo.
- **Docker Desktop on the PC is fragile** when other projects' containers auto-start. Local DB tests need `docker stop $(docker ps -q)` first. CI remains the fallback.
- **`POSTGRES_PASSWORD` and `ENCRYPTION_KEY` remain exposed in an earlier chat** (parent session), not rotated. Low practical risk.

## Open Questions

1. Did the user write the Test NFC link onto the school-ID chip, or only open the URL in a browser? Which card will be on the NTAG215 at the defense?
2. Should the card PDF / UID scan "allergies" switch to `patients.allergies` (decrypted) to match the tap view, or is the medical-history list intended there?
3. Is the gateway SIM loaded yet, and does a test SMS now show **sent**?
4. Did CI on PR #23 run green? (Presumably yes, since the user merged. `gh` is not installed to check.)
5. (Carried) The Phase 8 retention-test fake file: harmless; check `ls -l /var/backups/smarthealth` some time.

## Quick Start for Next Session

```bash
# Reference docs (read first)
cat plans/handoffs/HANDOFF_phase10-admin-model-b-done_2026-11-19.md
cat CLAUDE.md            # model B bullet, PHI rules
cat DEV-WORKFLOW.md      # §5 local DB tests, §6 deploy.sh, §9 jobs, §11 troubleshooting

# Key files (explore adjacent code too)
frontend/web/lib/permissions.ts
backend/app/api/v1/endpoints/medical_history.py      # _CLINICAL :57, _PHI_READ :60, _NOTES_ROLES :62
backend/app/api/v1/endpoints/immunizations.py        # _PHYSICIAN_ONLY :56 → DELETE :223
backend/app/api/v1/endpoints/health_cards.py         # _patient_allergies :212; condition_name "allergies" :1587, :2156, :2839

# Verify current state (PowerShell on PC)
git fetch --prune; git checkout main; git pull; git log --oneline -3   # expect 3ac073b on top
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health
# Claude may check the server read-only (git/compose status only; querying prod PHI tables was denied):
#   ssh -o BatchMode=yes azureuser@smarthealth-hub.japaneast.cloudapp.azure.com 'cd /opt/smarthealth-hub && git log --oneline -1'

# Local DB tests: user stops other containers first (docker stop $(docker ps -q)), then DEV-WORKFLOW §5

# Next action
# Ask the user what's next: defense readiness (SIM, final chip, deactivate Test NFC)
# or an optional item (allergies-source consistency is the most demo-visible).
```

## Session Closed
**Closed at:** 2026-11-19 (Manila, UTC+8)
**Commit:** the `session: phase10-admin-model-b-done [standalone-9d299342]` commit on branch `docs/handoff-phase10-done` that includes this note (run by the user from the commands Claude provided; merge via PR, docs only, no server update needed)
**Session status:** Handed off to next session
