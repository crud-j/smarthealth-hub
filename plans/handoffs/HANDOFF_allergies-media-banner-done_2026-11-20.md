# Allergies end-to-end, Edit Patient save fix, /media lockdown and allergy banner are DONE and deployed; next: keep the registration house number / landmark text (new DB column)

**Date:** 2026-11-20
**Status:** COMPLETED (5 PRs merged and live). Next session starts a new task: the house-number / landmark fix.
**Bead(s):** none (`bd` CLI not installed on this PC)
**Epic:** Deploy SmartHealth Hub to production and harden it (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `6`
**Parent:** `HANDOFF_phase10-admin-model-b-done_2026-11-19.md`
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > `HANDOFF_nfc-backups-done_2026-11-19.md` > `HANDOFF_phase9-system-health-done_2026-11-19.md` > `HANDOFF_phase10-admin-model-b-done_2026-11-19.md` > this

> ⚠️ This repo is **PUBLIC**. This file deliberately contains no passwords, keys,
> email addresses, phone numbers, patient names, patient codes or allergy values of
> real/test patients, TextBee device IDs, NFC signatures or chip serials. Never add them.

---

## Stale References

Identifiers from the parent (seq 5) that no longer exist or moved. All changes were intentional.

- `_patient_allergies` defined in `health_cards.py:212` (parent): **moved** to `backend/app/services/card_generation_service.py` as public `patient_allergies()`. `health_cards.py` imports it under the old name: `from app.services.card_generation_service import patient_allergies as _patient_allergies`. The same applies to `card_allergies as _card_allergies` and `NO_ALLERGIES_TEXT as _NO_ALLERGIES_TEXT`.
- Parent "condition_name allergies" anchors `health_cards.py:1587`, `:2156`, `:2839`: **removed**. Every card surface now calls `_card_allergies(patient)`.
- Parent: tap view empty text `None recorded.` (`:357`): **changed** to `f'{_NO_ALLERGIES_TEXT}.'`, which renders as "None on record."
- `patientUpdateSchema = patientCreateSchema` (frontend `lib/schemas/patient.ts`): **replaced** by a dedicated edit schema (`pick` + `extend` + `superRefine`).
- `app.mount("/media", StaticFiles(...))` in `backend/app/main.py`, plus the Next.js `/media/:path*` rewrite: **removed** on purpose (security). Do not re-add them.

## Since Last Handoff

- **Parent step 1 (PC housekeeping):** done.
  - Local `main` is at `2dd76ac`. All feature branches from this session are deleted locally and on GitHub.
  - **The parent handoff file was never merged** (branch `docs/handoff-phase10-done`, commit `67d5af5`). It is now included, staged, in this session's docs branch `docs/handoff-phase11`, so one PR lands both. Delete `docs/handoff-phase10-done` on GitHub after that PR merges.
- **Parent step 2 (defense items):** not done.
  - SIM, final NTAG215 chip and demo PDFs were not mentioned.
  - **"Test NFC" does not exist under that name.** The user searched "Test" in Patients and got "No patients match". The test patient with an allergy was registered under another name; the user knows its patient code. The parent's step 2c must use that patient.
- **Parent step 3 (optional cleanups), first item:** the allergies-source inconsistency is **DONE**, in more depth than planned (PR #25 + #26). This session also found a 4th surface (the Celery worker) and fixed it.
- **Parent Open Question 2** (card PDF / UID scan allergies source): answered. Everything uses `patients.allergies`, decrypted.
- **Parent Risk "allergies shown differently across surfaces":** resolved.
- **New work the parent did not foresee** (all user-approved with "go, all defaults"):
  - allergies editing on existing patients (#26)
  - Edit Patient "Save Changes" did nothing, broken since 2026-08-08 (#27)
  - public `/media` exposed patient photos and card PDFs without login (#28)
  - allergy banner at the point of care (#29)
- **Trajectory:** from "optional extras" to correctness/safety fixes found by reading the code.
  - Next is a schema change: the first Alembic migration since `0028`.

## Reference Documents

- `CLAUDE.md`: project conventions.
  - PHI rules; new DB changes must be Alembic migrations.
  - Admin model B; AES-256-GCM on allergies/known_conditions.
  - Module boundaries: services in `app/services/`, routes in `app/api/v1/endpoints/`.
- `docs/SmartHealth_Hub_System_Development_Plan.md`: authoritative schema/API reference (not read this session).
- `DEV-WORKFLOW.md`: §5 throwaway Docker test DB, §6 `deploy.sh`, §11 troubleshooting.
- `plans/handoffs/HANDOFF_phase10-admin-model-b-done_2026-11-19.md` (parent, seq 5): Phase 10 access matrix, Docker incident, deploy flow.
- Claude memory `deployment_setup.md`: has a "Card allergies fix DONE 2026-11-20" paragraph and the `--noconftest` gotcha.

## The Goal

SmartHealth Hub runs in production for the thesis defense (thesis: Barangay Health Center records system with NFC/QR health cards, SMS reminders, OTP MFA).

- **Website:** `https://smarthealth-hub-two.vercel.app` (Vercel, auto-deploys on merge to `main`).
- **API:** `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose, deployed by hand with `scripts/deploy.sh`).

The hardening roadmap (Phases 7–10) was finished last session. This session made patient data correct and safe where staff actually use it:
- allergies are consistent on every surface, editable, and visible when giving medicine or vaccines;
- the edit form saves;
- photos and card PDFs need a login.

**The user's explicit next task:** registration currently **drops the "Home Address / Landmark" text** (house number, street, landmark) whenever barangay/municipality/province are filled in. Fix it with a new DB column + Alembic migration, so the full address reaches the patient record and the card.

## Where We Are

### Production
- **Backend** runs merge `901b74b` (PR #28) or later.
  - Verified by reading the live `/openapi.json`: it contains the new photo URL format `/photo?v=<n>`.
  - PRs #27 and #29 are frontend-only, so the backend needs no redeploy for them.
- **Frontend (Vercel)** deployed `2dd76ac` (PR #29). The GitHub commit status says `Vercel: success - Deployment has completed`. The user confirmed: "it appears now".
- **API health:** `{"status":"ok","service":"smarthealth-hub-api","version":"0.1.0"}`, HTTP 200 in 0.36 s.
  - Earlier that day it timed out because the VM was **Stopped (deallocated)** by the 23:00 Manila auto-shutdown. The user started it from the Azure portal (VM list → Start → "Yes").

### Allergies (PRs #25, #26, #29)
- **Single source:** `patients.allergies` (AES-256-GCM), decrypted by `card_generation_service.patient_allergies(patient) -> str | None`.
- **Card wrapper:** `card_allergies(patient) -> str` falls back to `NO_ALLERGIES_TEXT = "None on record"`.
- **Used by:**
  - NFC tap view HTML (`_render_nfc_view_html`)
  - relay-monitor cache (`view_health_card_by_identifier`)
  - single PDF (`download_health_card_pdf`)
  - batch PDF (`batch_health_card_pdf`)
  - UID scan (`_scan_nfc_uid_impl`)
  - Celery PDF worker (`backend/app/workers/health_card_tasks.py`)
- **No surface prints `medical_histories.condition_name` as allergies any more.** The `MedicalHistory` model has no category column, so condition names were never allergies.
- **Editing:** Edit Patient has an "Allergies & Conditions" section.
  - `PUT /patients/{id}` with `allergies` / `known_conditions` set to `null`, `""` or whitespace **clears** them (`_CLEARABLE_TEXT_FIELDS` in `patient_service.update_patient`).
  - Omitting the field leaves it unchanged.
- **Banner:** `frontend/web/components/ui/AllergyAlert.tsx` contains:
  - `AllergyAlert({status, allergies, editHref})`
  - `PatientAllergyAlert({patientId, showEditLink})`, which loads the patient itself.
- **Banner placements:** profile, Log Visit, per-patient Immunization Records, and the sidebar Immunizations Add/Edit dialog (after a patient is picked; no edit link there).

### Edit Patient (PR #27)
- `patientUpdateSchema` validates only the fields on the edit page.
  - Address: requires `effectiveAddress(...)` to be non-empty.
- On a failed validation, a toast says "Please check: …".
- **Emergency Contact** now edits `emergency_contact_name/number`; previously it edited `guardian_*`. **Guardian** is its own section.
- Structured address fields (Sitio/Purok, Barangay, Municipality, Province) plus a "Complete Address" fallback, and a live "Address after saving" preview built with `effectiveAddress()`.

### Media (PR #28)
- **No `/media` route anywhere.** Photos are served only by `GET /api/v1/patients/{id}/photo` (JWT header or httpOnly `access_token` cookie, `Cache-Control: private, max-age=86400`).
- API responses carry `photo_api_url(patient_id, photo_path)` = `/api/v1/patients/{id}/photo?v=<file mtime>`. A missing file gives `v=0`.
- Health Cards list "Download PDF" uses the authenticated on-demand `GET /api/v1/health-cards/{id}/pdf` through `lib/health-card-pdf.ts`.

### Tests and repo
- **Frontend vitest:** 43 passed (7 files). It was 16 at the start of the session.
- **tsc:** 0 errors. **eslint:** 0 errors on all changed files (pre-existing warnings only).
- **Backend CI pytest:** green on every PR (#25–#29).
  - Locally only DB-free tests ran (Docker Desktop was off all session).
  - New backend tests: `test_nfc_allergies.py` 9 total; `test_patients.py` +10 cases; `test_media_access.py` 8.
- **Uncommitted on the PC, never commit without asking:** `README.md` (user's ssh line ~134), `backend/celerybeat-schedule-shm`, `backend/celerybeat-schedule-wal`, `START.md`, `dump.rdb`, `start-tunnel.ps1`. `stash@{0}` is still present; don't drop it.
- **Current local branch:** `docs/handoff-phase11` (from `2dd76ac`). Staged: the parent handoff file. This file is added by the user's commit.

## What We Tried (Chronological)

1. **Onboarding (read-only).**
   - The pasted handoff path did not exist on `main`. Found it on the unmerged branch `docs/handoff-phase10-done` and read it with `git show <branch>:<path>`, without switching branches.
   - `bd` was not installed.
   - Prod `/health` returned HTTP 000 after 21 s.
     - DNS resolved to the server IP; Vercel answered 307.
     - TCP probes to ports 22/80/443 all failed.
     - Memory note: "Azure auto-shutdown ON at 23:00 Manila". So the VM was off, not broken.
   - Read the three allergies sites and `MedicalHistory` (no category column). Found the card "Allergies / Alerts" box listed every condition (e.g. "Hypertension") and ignored registration allergies.
2. **PR #25 `fix/card-allergies-source`.**
   - TDD: the new tests failed with `ImportError` (helper missing).
   - Then all 9 tests errored in setup: `InvalidCatalogNameError: database "smarthealthhub_test" does not exist`.
   - **Cause:** `conftest.py:117` `db_tables` is `scope="session", autouse=True`, so every test needs Postgres. **Fix:** run DB-free tests with `--noconftest`. 9 passed.
   - Commit `9d45aa2`, merge `3be64c1`. User deployed and sent a card PDF screenshot showing the real allergy highlighted red.
3. **Wrong claim, later corrected.** I told the user "card PDFs are built fresh each time, no stored PDFs". False: `generate_health_card_pdf_task` (Celery) writes `media/health_cards/<card_id>.pdf` and stores `pdf_url`, and still used condition names. Fixed in PR #26 and disclosed to the user.
4. **PR #26 `feat/edit-patient-allergies`.**
   - Backend already accepted and encrypted allergies on PUT. But `update_patient` used `model_dump(exclude_none=True)`, and the schema strips `""` to `None`, so **clearing was impossible**.
   - Added `_CLEARABLE_TEXT_FIELDS` using `data.model_fields_set`.
   - Moved the helpers to `card_generation_service`, which the worker can import (avoids worker→endpoint layering). Fixed the worker.
   - Frontend `textFieldChange()` sends a field only when changed, so the audit `changed_fields` stays honest.
   - PR body claimed "the patient page shows the allergy"; a grep showed it doesn't. Corrected the body before handing over.
   - Commit `dff84e7`, merge `a1da107`. CI pytest green, including 7 new DB cases.
5. **User asked for "the solution that really solved the real problem"** for two findings.
   - Explained that photos are `patient_photos/<patient_id>.jpg` behind a public `/media` mount, and the patient id is in every QR/NFC link.
   - Explained that the real allergy problem is visibility at the point of care, not a line on the profile.
   - User: "go, all defaults", and reported "on the patients edit, it cannot saved changes, the button is not clickable."
6. **PR #27 `fix/patient-edit-save`.**
   - Root cause: `patientUpdateSchema = patientCreateSchema`. Since commit `c01ffcd` (2026-08-08) the create schema requires barangay, municipality, province, emergencyContactName/Number and `dataPrivacyConsent === true`. None of these are on the edit page, so `handleSubmit` never called `onSubmit` and no error was visible.
   - TDD: 7 of 9 new schema tests failed on the old schema.
   - Also found:
     - "Emergency Contact" edited `guardian_*`, which the card doesn't print.
     - Editing "Complete Address" had no effect, because `_compose_address` prefers structured parts.
     - The registration landmark text is lost (next task).
   - False alarm checked: `toApiPayload` always sends `registration_data_source: "manual"`, but `PatientUpdate` has no such field and pydantic ignores extras.
   - Commit `92f394e`, merge `0c39425`. CI green, including 3 new DB tests.
7. **PR #28 `fix/media-auth`.**
   - Confirmed auth is an httpOnly cookie (`api-client.ts` `credentials: "include"`, cookie path `/`). So a same-origin `<img src="/api/v1/patients/{id}/photo">` through the Vercel rewrite authenticates.
   - The authenticated photo GET endpoint already existed but was unused.
   - Removed the mount and rewrite. Added `photo_api_url`, `Cache-Control: private`, and `downloadHealthCardPdf`.
   - Removed the `?t=Date.now()` cache-buster on the profile, which would have produced `?v=..?t=..`.
   - Fixed a false docstring in `patient_photo_service.py` that claimed /media was served only through an authenticated endpoint.
   - Commit `cb91664`, merge `901b74b`. CI green.
   - **Prod verification trick:** `/media/x` returns 404 both before and after (missing file), so it proves nothing. Instead `curl /openapi.json` and search for `/photo?v=<n>`. Result: "NEW backend (PR #28) deployed".
8. **PR #29 `feat/allergy-banner`.**
   - `usePatient` reports `loading:false, data:null, error:null` before its first fetch, and keeps the previous patient's `data` while a new id loads.
   - `PatientAllergyAlert` treats `!patient || patient.id !== patientId` as loading. Tests cover both traps.
   - 12 vitest tests.
   - **First "pushed" was false:** nothing was committed and the remote branch didn't exist. Re-sent the commands one per line with expected output; the second attempt worked.
   - Commit `192431f`, merge `2dd76ac`. Vercel status success.
9. **Finding the demo patient.**
   - The parent's "Test NFC" name doesn't exist.
   - Patient search matches last/first name, patient_code, mobile, PhilHealth no., address and birth date (`patient_service.py:190-196`). The user can search by the numeric part of the code.
10. **Warning the user about PHI in screenshots.**
    - The card screenshot the user sent showed a real-looking patient: name, phone, PhilHealth number, allergy.
    - Told them to keep it out of the repo (it's public) and not to paste copied photo URLs (they identify a patient).
    - This file follows the same rule: no names, codes or allergy values.
11. **Handoff prep** (this file).
    - Researched the landmark fix: write/display sites, Alembic head, `RUN_MIGRATIONS`, intake `house_street` storage (see Code Analysis).
    - Created `docs/handoff-phase11` from `2dd76ac`.
    - Restored the parent file from `origin/docs/handoff-phase10-done` (staged).

## Key Decisions

- **One allergies source** (`patients.allergies`, decrypted) for every surface; never `medical_histories.condition_name`.
  - Why: a chronic condition is not an allergy, and the registration allergy was invisible on the printed card.
  - Rejected: listing conditions as "alerts" on the card. That puts chronic conditions on a physical card, a privacy choice the user never made.
- **Empty text "None on record" everywhere.** `card_back.html` and `HealthCardPreview.tsx` compare against that exact string for the red highlight.
- **Helpers live in `card_generation_service`,** not the endpoint module, so the Celery worker can use them without importing an API module. `health_cards.py` keeps the old private names via aliases, so tests and call sites stayed stable.
- **Clearing only for `allergies` / `known_conditions`.** Rejected: switching `update_patient` to `exclude_unset` for all fields; too broad a behaviour change (e.g. `bloodType: null` would start clearing).
- **Edit form sends allergies only when changed** (`textFieldChange`), to keep `audit_logs.metadata.changed_fields` accurate. Audit rows store field names only, never values (tested).
- **Edit schema = only the edit page's fields** (`pick` + `extend`), not `.partial()` of the create schema.
  - Address rule mirrors backend `_compose_address`: structured parts win, else free text.
  - Older seeded patients have only the free-text address.
- **Toast on invalid submit** (`onInvalid`), so a hidden-field validation failure can never be silent again.
- **Remove `/media` entirely** rather than add auth to StaticFiles or put a proxy in front. Every consumer already had, or could use, an authenticated endpoint.
  - Photo URLs are versioned with file mtime, so browser caching is safe.
  - Rejected: a PHI_VIEW audit per photo load (would spam the log on every page).
- **Health Cards list download uses on-demand `/pdf`.** Always current. The Celery-stored PDF is now unused but still written (left for a later decision).
- **Banner wording "No allergies on record"**, never "No known allergies": the system can't tell "none" from "never asked". While loading show a placeholder, never reassuring text.
- **Banner in four places, including the sidebar immunization dialog,** because that is where vaccines are actually recorded for any patient.
  - No edit link inside the dialog (leaving loses the form).
  - Visible to all staff (Phase 10 decision 1).
- **Separate PRs per problem**, in order: bug the user hit (#27), then security (#28), then feature (#29). Each was verified before the next started, because the user commits and a dirty tree would mix PRs.
- **Landmark fix deferred to next session** at the user's request ("i want it done on the next session"). It needs a new column + migration.

## Evidence & Data

### Commit / PR log (this session, all merged to `main`)
| PR | Branch | Commit | Merge | Summary | Files |
|---|---|---|---|---|---|
| #25 | fix/card-allergies-source | `9d45aa2` | `3be64c1` | card PDF + UID scan use real allergies; one empty text | 2 (+113/−42) |
| #26 | feat/edit-patient-allergies | `dff84e7` | `a1da107` | edit/clear allergies + known conditions; worker PDF allergies; helpers moved | 9 (+239/−44) |
| #27 | fix/patient-edit-save | `92f394e` | `0c39425` | Edit Patient save fix; emergency contact; structured address + preview | 4 (+326/−20) |
| #28 | fix/media-auth | `cb91664` | `901b74b` | remove public /media; authenticated photo URLs; PDF download via /pdf | 16 (+340/−59) |
| #29 | feat/allergy-banner | `192431f` | `2dd76ac` | AllergyAlert banner in 4 places | 6 (+223) |

### CI results (GitHub check-runs, all `completed/success`)
| Commit | Backend pytest | mypy | Backend lint | tsc | Frontend lint | Builds | Vercel |
|---|---|---|---|---|---|---|---|
| `dff84e7` (#26) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `92f394e` (#27) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `cb91664` (#28) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `192431f` (#29) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `2dd76ac` (main) | — | — | — | — | — | — | `success - Deployment has completed` |

(Read via `https://api.github.com/repos/crud-j/smarthealth-hub/commits/<sha>/check-runs` and `/status`. The repo is public, so no auth is needed.)

### Deploy & user-verification status per PR
| PR | Needs backend deploy? | Deployed | User verified in prod? |
|---|---|---|---|
| #25 card allergies | yes | `deploy.sh` → user saw `OK: commit 3be64c1 is running` | ✅ downloaded card PDF showed the real allergy, red box |
| #26 edit/clear allergies + worker | yes | went live with the #28 deploy (`901b74b` includes it) | ⚠️ not explicitly tested (edit page then could not save at all, see #27) |
| #27 Edit Patient save | no (frontend + tests) | Vercel auto on merge `0c39425` | ⚠️ **not reported**: ask "does Save Changes work now?" |
| #28 /media lockdown | yes | backend confirmed via `/openapi.json` text; Vercel auto | ⚠️ private-window check of an old `/media/patient_photos/...` URL (expect 404) **not reported** |
| #29 allergy banner | no | Vercel `success - Deployment has completed` on `2dd76ac` | ✅ "it appears now" |

### Test count history
| Point | vitest | DB-free pytest (local, `--noconftest`) | New DB tests (CI only) |
|---|---|---|---|
| Session start | 16 | 3 (`test_nfc_allergies.py`) | — |
| After #25 | 16 | 9 | 0 |
| After #26 | 19 (+3 `text-field-change`) | 9 | +7 cases (`test_patients.py`: encrypt/decrypt, clear ×3 params, omit keeps, audit) |
| After #27 | 28 (+9 `patient-edit-schema`) | 9 | +3 (`structured_address_wins`, `free_text_address`, `emergency_contact`) |
| After #28 | 31 (+3 `health-card-pdf`) | 12 (+3 `photo_api_url`) | +5 (`/media` photo 404, `/media` pdf 404, 401, bearer 200, cookie 200, response URL) |
| After #29 | 43 (+12 `AllergyAlert`) | 12 | 0 |

### Allergies source per surface (before → after)
| Surface | Code | Before | After |
|---|---|---|---|
| NFC tap view | `_render_nfc_view_html` | `patients.allergies` decrypted; empty "None recorded." | same source; "None on record." |
| Relay-monitor cache | `view_health_card_by_identifier` | `_patient_allergies or "None on record"` | `_card_allergies` |
| Single card PDF | `download_health_card_pdf` | `", ".join(medical_histories.condition_name)` | `_card_allergies` |
| Batch card PDF | `batch_health_card_pdf` | condition names | `_card_allergies` |
| UID scan / `/nfc-monitor` | `_scan_nfc_uid_impl` | separate `select(MedicalHistory.condition_name)` | `_card_allergies` (query removed) |
| Celery stored PDF | `health_card_tasks.py` | condition names | `card_allergies` |
| On-screen Print preview | `HealthCardPreview.tsx` | `patient.allergies` (already correct) | unchanged |
| Profile / Log Visit / immunizations | — | not shown | `AllergyAlert` banner |

### /media exposure (before PR #28)
| Path | Content | Guessable? |
|---|---|---|
| `/media/patient_photos/<patient_id>.jpg` | patient photo | **yes**: patient id is in every QR/NFC link and in app URLs |
| `/media/health_cards/<card_id>.pdf` | name, DOB, phone, address, allergies, emergency contact | no (random UUID), but anyone holding the link |
| Served by | `app.mount("/media", StaticFiles(..., html=False))` in `main.py`, plus the Next.js rewrite `/media/:path*` | no auth at all |

### Production verification commands used (safe, read-only)
```bash
curl -s -m 30 -w "\nHTTP %{http_code} in %{time_total}s\n" https://smarthealth-hub.japaneast.cloudapp.azure.com/health
for p in 22 80 443; do timeout 8 bash -c "echo > /dev/tcp/<server-ip>/$p" && echo open || echo closed; done   # VM up?
curl -s https://smarthealth-hub.japaneast.cloudapp.azure.com/openapi.json | grep -c '/photo?v=<n>'          # PR #28 deployed?
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/<sha>/status"                          # Vercel deployed?
```

### Edit Patient bug reproduction (vitest on the old schema)
- `accepts an older patient with only a free-text address`: ✗ (old) → ✓
- `accepts a patient registered with a structured address and emergency contact`: ✗ → ✓
- `does not require data privacy consent`: ✗ → ✓
- `requires some address`: ✗ → ✓
- `still validates the emergency contact number format`: ✓ → ✓
- `still requires first name, last name and sex`: ✓ → ✓
- 3 × `effectiveAddress`: ✗ (missing) → ✓

### Pre-existing lint findings (not from this session; leave or fix in a cleanup PR)
| File | Finding |
|---|---|
| `backend/tests/test_patients.py` | ruff I001 + F401 `datetime.datetime`, `datetime.UTC` (was 4 incl. unused `pytest` on main; now 3) |
| `frontend/web/app/(dashboard)/health-cards/page.tsx` | eslint `react-hooks/set-state-in-effect` ×3 (≈395, 435, 452), `exhaustive-deps` (≈428) |
| `frontend/web/app/(dashboard)/patients/[patientId]/page.tsx` | `@next/next/no-img-element` (≈372) |
| `.../[patientId]/immunizations/page.tsx` | `set-state-in-effect` (≈213) |
| `.../[patientId]/edit/page.tsx` | `react-hooks/incompatible-library` on `watch()` |
| many pages | IDE Tailwind hints (`focus-visible:outline` + `outline-2` conflict, canonical class names) |

### Scratch files (session scratchpad; may be cleared on reboot)
`C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\1677c757-f9a2-485a-a204-3c6559ccae1a\scratchpad\`:
- Commit messages: `commit-allergies.txt` (#25), `commit-edit-allergies.txt` (#26), `commit-edit-save.txt` (#27), `commit-media-auth.txt` (#28), `commit-allergy-banner.txt` (#29), `commit-handoff-phase11.txt` (this handoff)
- PR bodies: `pr-body-allergies.md`, `pr-body-edit-allergies.md`, `pr-body-edit-save.md`, `pr-body-media-auth.md`, `pr-body-allergy-banner.md`
- `test_patients_main.py`: copy of `main`'s `test_patients.py`, used to prove the ruff findings were pre-existing

## Code Analysis

### Address handling (needed for the next task)
- **Model** `backend/app/models/patient.py:85-92`:
  - `household_number String(50)`; `sitio_purok`, `barangay`, `municipality`, `province` String(150), all nullable
  - `address Text NOT NULL`
  - Indexes on `household_number`, `barangay`, `municipality`
  - **There is no column for house number / street / landmark.**
- **`_compose_address`** in `backend/app/services/patient_service.py:102-115`, signature `(*, address, sitio_purok=None, barangay=None, municipality=None, province=None) -> str`:
  - If any structured part is non-blank: returns `", ".join(structured parts)`, **discarding `address`**.
  - Else: returns cleaned `address` or `""`.
- **Create** `patient_service.create_patient` `:326`: `address=_compose_address(address=data.address, sitio_purok=..., barangay=..., municipality=..., province=...)`.
- **Update** `update_patient`:
  - The `address` field alone → `_compose_address(address=value)`.
  - Then if any of sitio/barangay/municipality/province/address was sent, `patient.address = _compose_address(address=update_fields.get("address", patient.address), sitio_purok=patient.sitio_purok, ...)` (`:447-456`).
- **Registration frontend** `frontend/web/app/(dashboard)/patients/new/page.tsx`:
  - `addressValue = watch("address")` (`:200`), from a textarea labelled **"Home Address / Landmark \*"** (`:533`, placeholder "House no., street, landmark or nearby reference").
  - `composedAddress = [addressValue, barangay, municipality, province].join(", ")` (`:207-210`). Note it skips `sitioPurok`.
  - Submit sends `address: composedAddress` plus the structured parts (`:271`). The backend then throws the landmark away.
  - The UI preview "Combined address: …" (`:538`) **lies**: it shows the landmark, but the stored address doesn't have it.
- **Intake (patient self-entry)**:
  - `backend/app/schemas/intake_application.py:79` has `house_street: str | None = Field(None, max_length=255, description="House No. / Street")`.
  - `intake_application_service.py:192-223` composes `[house_street, barangay, municipality, province]` into `address` and also passes the structured parts. So **intake-registered patients lose it too**.
  - **The original text survives** in `intake_applications.form_data` (JSONB, `models/intake_application.py:48`) under key `house_street`.
  - `intake_applications.patient_id` (FK → patients, `:67`) links approved applications to the created patient. **So a backfill is possible for intake patients**, not for staff-registered ones.
- **Display:**
  - `templates/health_card/card_back.html:44-56`: if barangay/municipality/province exist, renders `sitio, barangay, municipality, province`; else `patient.address`.
  - NFC tap view `health_cards.py:~254-261`: `address_display = ", ".join([sitio_purok, barangay, municipality, province]) or patient.address`.
  - `templates/patient_summary/summary.html:74` uses `patient.address`.
  - `patients.py:867` (summary PDF data) uses `patient.address`.
  - The card PDF dicts pass `address` and the structured fields: `health_cards.py:1589/2151`, worker `:179`.
- **Edit page (after #27):**
  - `effectiveAddress()` in `frontend/web/lib/schemas/patient.ts` mirrors `_compose_address`.
  - Pinned by backend tests `test_update_patient_structured_address_wins_over_free_text` and `..._free_text_address_used_without_structured_parts` **in `test_patients.py`. Changing the compose rule must update both sides and these tests.**
- **Alembic:**
  - Head is `0028` (`0028_intake_token_purpose_fields.py`, down `0027`). Next revision: `0029`.
  - Naming style: `00NN_snake_description.py` with `revision: str = "00NN"` and `down_revision: str | None = "00NN-1"`.
  - One odd file, `5c3c523b3fc1_add_health_card_generation_status.py` (down `0021`, with `0022` pointing to it), is part of the linear chain.
- **Migrations in production:** `backend/scripts/entrypoint.sh:35` runs `alembic upgrade head` when `RUN_MIGRATIONS=true`. That is set for the API service in `docker-compose.server.yml:79`. **So `deploy.sh` applies the migration automatically.**

### Other code facts learned
- **Auth transport:** httpOnly cookies `access_token` / `refresh_token`, `path="/"`, `secure` in production (`backend/app/api/v1/endpoints/_cookies.py`). `require_role` / `CurrentUser` read the Bearer header first, then the cookie (`core/security.py:351-371`). The frontend `apiFetch` uses `credentials: "include"`. In production `NEXT_PUBLIC_API_BASE_URL=/api/v1` (same origin via the Vercel rewrite).
- **`usePatient(id)`** (`hooks/usePatients.ts:457`): no fetch when `id` is falsy. It returns `{data, loading, error, refetch}`, with initial `loading=false`, and keeps stale `data` across id changes.
- **`PUT /patients/{id}`** guard is `_BHW_PLUS = require_role("bhw","physician","admin_staff","admin")` (`patients.py:56`). Deactivate is `_ADMIN_ONLY`.
- **`BaseSchema`** (`schemas/_base.py`): `from_attributes`, `populate_by_name`, `str_strip_whitespace`. Extra fields are ignored, not forbidden.
- **`_normalise_mobile`** returns `+63` + 10 digits. `""` / whitespace becomes `None`.
- **Patient list search** (`patient_service.py:190-196`): ILIKE on last_name, first_name, patient_code, mobile, PhilHealth no., address, `birth_date::text`.
- **Celery worker** `generate_health_card_pdf_task` still writes `MEDIA_DIR/health_cards/<card_id>.pdf` and sets `card.pdf_url` and `generation_status="ready"`. The frontend only uses the `ready` status now. The files are unreachable over HTTP but still on disk and in backups.
- **Test fixtures:**
  - `conftest.py`: `client`, `db_session` (SAVEPOINT per test), `make_user(role)`, `make_role`, `admin_token`, `bhw_token`.
  - `test_patients.py` has `sample_patient` and `bhw_user` (local fixtures) and the `_put(client, patient_id, token, body)` helper added this session.

## Files Changed

### Backend source
- `backend/app/api/v1/endpoints/health_cards.py` (#25, #26, #28): allergies via `_card_allergies`; condition-name allergy code removed; UID scan query removed; verify `photo_url` via `photo_api_url`; tap empty text.
- `backend/app/services/card_generation_service.py` (#26): `NO_ALLERGIES_TEXT`, `patient_allergies`, `card_allergies`; imports `Patient`, `decrypt_text`.
- `backend/app/services/patient_service.py` (#26): `_CLEARABLE_TEXT_FIELDS`; clearing loop in `update_patient`; docstring.
- `backend/app/workers/health_card_tasks.py` (#26): `card_allergies(patient)`; `MedicalHistory` import and query removed; docstring step 3.
- `backend/app/services/patient_photo_service.py` (#28): `photo_api_url()`; upload returns it; security docstring corrected.
- `backend/app/api/v1/endpoints/patients.py` (#28): `photo_path` in responses via `photo_api_url`.
- `backend/app/api/v1/endpoints/patient_photos.py` (#28): photo GET sends `Cache-Control: private, max-age=86400`.
- `backend/app/main.py` (#28): `StaticFiles` import and `/media` mount removed; comment explains why.
- `backend/app/schemas/{patient,health_card,patient_photo}.py` (#28): descriptions show `/api/v1/patients/<id>/photo?v=<n>`.

### Frontend source
- `frontend/web/app/(dashboard)/patients/[patientId]/edit/page.tsx`:
  - #26: Allergies & Conditions section.
  - #27: schema, `onInvalid` toast + `FIELD_LABELS`, emergency contact/guardian split, structured address + preview.
- `frontend/web/lib/schemas/patient.ts` (#27): `effectiveAddress()`; new `patientUpdateSchema`; `PatientUpdateFormValues = z.infer<...>`.
- `frontend/web/lib/text-field-change.ts` (#26, new): `textFieldChange(original, edited) -> string | null | undefined`.
- `frontend/web/types/patient.ts` (#26, #28): `allergies` / `knownConditions` are `string | null` on the create payload; photo comment.
- `frontend/web/types/healthCard.ts` (#28): photo URL comments.
- `frontend/web/lib/health-card-pdf.ts` (#28, new): `downloadHealthCardPdf(patientId, filename)`.
- `frontend/web/app/(dashboard)/health-cards/page.tsx` (#28): Download PDF button uses the helper with a toast on error.
- `frontend/web/app/(dashboard)/patients/[patientId]/page.tsx` (#28, #29): no `?t=` cache-buster; `AllergyAlert`.
- `frontend/web/next.config.ts` (#28): `/media` rewrite removed.
- `frontend/web/components/ui/AllergyAlert.tsx` (#29, new).
- `frontend/web/app/(dashboard)/patients/[patientId]/visits/new/page.tsx` (#29): banner.
- `frontend/web/app/(dashboard)/patients/[patientId]/immunizations/page.tsx` (#29): `PatientAllergyAlert`.
- `frontend/web/app/(dashboard)/immunizations/page.tsx` (#29): banner in the Add/Edit dialog.

### Tests
- `backend/tests/test_nfc_allergies.py`: 9 DB-free tests (helpers + tap view render).
- `backend/tests/test_patients.py`: `_put` helper; 4 allergies tests (7 cases); 3 address/emergency tests; `decrypt_text` import.
- `backend/tests/test_media_access.py` (new): `media_file` fixture writes real files into `MEDIA_DIR` and removes them; `patient_with_photo`; 8 tests.
- `frontend/web/tests/lib/text-field-change.test.ts` (3), `patient-edit-schema.test.ts` (9), `health-card-pdf.test.ts` (3), `tests/components/AllergyAlert.test.tsx` (12).

### Docs / memory
- `plans/handoffs/HANDOFF_phase10-admin-model-b-done_2026-11-19.md`: restored from the unmerged branch, staged on `docs/handoff-phase11`.
- `plans/handoffs/HANDOFF_allergies-media-banner-done_2026-11-20.md`: this file.
- Claude memory `deployment_setup.md`: appended the card-allergies paragraph and the `--noconftest` note (after #25), plus a "Session 2026-11-20" paragraph covering #26–#29 and the next task (at handoff time).

## User Feedback & Preferences (REQUIRED)

- **"go, all defaults"** (said 3×): accepts the recommendation as stated. Keep giving one recommended option with the reason, plus a short "if I go, here's exactly what happens" when asked.
- **"if i go, all defaults, explain first what you'll do"**: before acting, the user wants a step-by-step plan, including what they must do and at which prompt.
- **"verify first"** (said every time after pushing/merging/deploying): always run `git fetch` + `git log origin/main` + `git show --stat` + the CI check-runs + the Vercel status (or `/openapi.json` for the backend) before saying anything else. Report in a small table.
- **"pushed"** can be wrong: once nothing had been committed. Check, then re-give commands **one line at a time** with the expected success output.
- **The user commits, pushes, opens and merges PRs themselves.** Give `git add <exact files>` (quote paths with parentheses/brackets), `git commit -F <scratchpad file>`, `git push -u origin <branch>`, a compare URL, and the PR body file path.
- **"what is the solution … that really solved the real problem"**: wants root-cause fixes, not cosmetic ones (e.g. "show allergies where staff act", not "add a line to the profile").
- **"is this it to start the VM??"** (screenshot of the Azure "start VMs" dialog): confirm UI steps from screenshots plainly ("Yes, click Yes").
- **"where can i find …"**: wants exact click paths (sidebar item → search text → row). When a named test patient doesn't exist, offer a search that works (the patient-code number).
- **"it appears now"**: a short confirmation closes the item.
- **Reports bugs mid-task** ("the button is not clickable"): fix the reported bug first, as its own PR, before continuing the queue.
- **"i want it done on the next session: Registration drops the house number / landmark text"**: explicit next task.
- Wants `/handoff` at the end and a paste-ready prompt.
- (Carried) Screenshots everything; never put secrets or patient details in output; confirm which prompt a command runs at (PowerShell on PC / `azureuser@smarthealth-server:~$` / browser).

## Where We're Going

1. **Merge this handoff (PowerShell on PC, then browser).**
   - Commit both handoff files on `docs/handoff-phase11`, push, merge the PR.
   - Then delete the GitHub branches `docs/handoff-phase10-done` (now redundant) and, optionally, `docs/handoff-update`.
2. **NEXT TASK: keep the house number / street / landmark** (user-requested). Recommended design, to confirm with the user in onboarding:
   - a. **Migration `0029_add_patient_house_street.py`:** add `patients.house_street VARCHAR(255) NULL`. Name and size match the intake field `house_street` (max 255). Not encrypted, like the other address columns. Downgrade drops it.
   - b. **Model / schemas:** add `house_street` to `Patient`, `PatientCreate`, `PatientUpdate`, `PatientResponse`, and the frontend `Patient` / `PatientCreatePayload` types plus `mapPatient` / `toApiPayload`.
   - c. **`_compose_address`:** add a `house_street` parameter as the first part: `house_street, sitio_purok, barangay, municipality, province`. Update all call sites (create, update, the recompose block). Make frontend `effectiveAddress()` identical, then update the two pinning tests and add new ones.
   - d. **Registration form:** bind the "Home Address / Landmark" textarea to `houseStreet`, not `address`. Send `address` = the composed value (or let the backend compose). Make the "Combined address" preview use `effectiveAddress()` so it tells the truth; it currently also omits sitio.
   - e. **Intake finalize** (`intake_application_service.py:192-223`): pass `house_street=fd.get("house_street")`.
   - f. **Edit page:** a House No. / Street / Landmark input; the preview includes it.
   - g. **Display:** add `house_street` to `card_back.html` (watch the card's space: test a long value) and to the NFC tap view `address_display`. The summary PDF uses `patient.address`, which then includes it automatically.
   - h. **Backfill (optional, ask):** in the migration or a separate script, `UPDATE patients p SET house_street = ia.form_data->>'house_street' FROM intake_applications ia WHERE ia.patient_id = p.id AND p.house_street IS NULL AND coalesce(ia.form_data->>'house_street','') <> ''`, then recompose `address`. Staff-registered patients' landmark text was never stored and can't be recovered; staff must re-enter it via Edit.
   - i. **Tests first:** backend DB tests (CI) for create/update/compose/intake mapping; DB-free unit tests for `_compose_address`; vitest for `effectiveAddress` and the registration preview.
   - j. **Deploy:** merge, then `deploy.sh`. `RUN_MIGRATIONS=true` applies `0029` on API startup. Verify by registering a test patient and checking the card back.
3. **Defense readiness (user items, remind once):** load the gateway SIM and send a test SMS; write the final NTAG215 from the demo patient's Print page; deactivate the test patient with the allergy once the chip doesn't point at it; regenerate demo card PDFs.
4. **Optional cleanups (ask first):**
   - delete stale stored card PDFs on the server (`media/health_cards/*.pdf`);
   - stop the Celery worker writing PDFs, or serve them through an authenticated route;
   - `datetime.utcnow()` and `HTTP_422_UNPROCESSABLE_ENTITY` deprecations;
   - ruff findings in old tests;
   - pre-existing eslint warnings;
   - registration form `composedAddress` omits sitio (fixed by 2d anyway).
5. **Thesis text:** describe model B, the allergy-safety changes (single source, banner wording) and the `/media` fix as a found-and-fixed security issue.

## Risks & Blockers

- **The landmark fix touches the address rule in 3 places** (backend `_compose_address`, frontend `effectiveAddress`, card template / NFC view). If they disagree, the "Address after saving" preview lies again. Keep the pinning tests in sync.
- **The card back has limited space;** a long house/street text could overflow `card_back.html`. Render a test PDF.
- **Local DB tests need Docker Desktop**, which was off all session and is fragile (parent: ~55 other containers auto-start; the user must `docker stop $(docker ps -q)` first). CI pytest is the fallback and was reliable all session.
- **VM auto-shuts down at 23:00 Manila.** If prod checks time out, ask the user to start the VM (Azure portal → Virtual machines → smarthealth-server → Start).
- **Vercel deploys on merge but the backend doesn't.** A PR that changes both, like the landmark fix with its new column + API field, needs `deploy.sh` right after merging. Otherwise the frontend sends `house_street` to an old backend; harmless, since extras are ignored, but the data is lost until deploy.
- (Carried) `POSTGRES_PASSWORD` / `ENCRYPTION_KEY` not rotated; gateway SIM has no load, so SMS fails silently at the carrier.

## Open Questions

1. Column name and shape: one `house_street` column (recommended; matches intake), or separate `house_number` + `street` + `landmark`?
2. Backfill intake-registered patients from `intake_applications.form_data->>'house_street'`? (Recommended yes, idempotent, in the migration or a one-off script.)
3. Show `house_street` on the printed card back and the NFC tap view? (Recommended yes, space permitting.)
4. Should the Celery worker keep writing card PDFs to disk now that nothing serves them? (Parked.)
5. Which patient is the defense demo patient, and is the test patient with an allergy still active?
6. Unverified in production (ask once, briefly, at onboarding):
   - a. Does Edit Patient → Save Changes work now (#27)?
   - b. Does an old `/media/patient_photos/<id>.jpg` URL in a private window give 404 while logged-in photos still show (#28)?
   - c. Does editing/clearing an allergy update the card (#26)?

## Quick Start for Next Session

```bash
# Reference docs (read first)
cat plans/handoffs/HANDOFF_allergies-media-banner-done_2026-11-20.md
cat CLAUDE.md                 # Alembic-only schema changes, PHI rules, module boundaries
cat DEV-WORKFLOW.md           # §5 Docker test DB, §6 deploy.sh

# Key files for the landmark fix (explore adjacent code too)
backend/app/models/patient.py                       # address columns :85-92
backend/app/services/patient_service.py             # _compose_address :102, create :326, update :430-456
backend/app/services/intake_application_service.py  # house_street composition :192-223
frontend/web/app/(dashboard)/patients/new/page.tsx  # "Home Address / Landmark" :533, composedAddress :207
frontend/web/lib/schemas/patient.ts                 # effectiveAddress (mirror of _compose_address)
backend/app/templates/health_card/card_back.html    # address row :44-56
backend/alembic/versions/0028_intake_token_purpose_fields.py   # migration style; head = 0028

# Verify current state (PowerShell on PC)
git fetch --prune; git checkout main; git pull; git log --oneline -3   # expect the handoff merge on top of 2dd76ac
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health   # times out → VM is off (23:00 auto-shutdown)
cd frontend/web; npx vitest run          # expect 43 passed
cd backend; python -m pytest tests/test_nfc_allergies.py tests/test_media_access.py -k "allergies or tap_view or photo_api_url" --noconftest -q   # expect 12 passed

# Next action
# Confirm the 3 design questions (column shape, backfill, show on card) with ONE recommendation each,
# then TDD: migration 0029 + _compose_address(house_street, ...) + registration/intake/edit wiring.
```

## Session Closed
**Closed at:** 2026-11-20 (Manila, UTC+8)
**Commit:** the `session: allergies-media-banner-done [standalone-9d299342]` commit on branch `docs/handoff-phase11` that includes this note and the restored parent handoff (run by the user from the commands Claude provided; merge via PR, docs only, no server update needed)
**Session status:** Handed off to next session
