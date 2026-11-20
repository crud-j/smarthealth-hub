# House/street fix, stored-PDF removal and Download→View/Print are DONE and live; thesis draft written; next: refine the sidebar, then strengthen System Administration

**Date:** 2026-11-20
**Status:** COMPLETED (4 PRs merged and live: #30, #31, #32, #33). Next session starts new work: the sidebar refinement, then System Administration.
**Bead(s):** none (`bd` CLI not installed on this PC)
**Epic:** Deploy SmartHealth Hub to production and harden it (Vercel frontend + Azure Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `7`
**Parent:** `HANDOFF_allergies-media-banner-done_2026-11-20.md`
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > `HANDOFF_azure-go-live_2026-11-18.md` > `HANDOFF_nfc-backups-done_2026-11-19.md` > `HANDOFF_phase9-system-health-done_2026-11-19.md` > `HANDOFF_phase10-admin-model-b-done_2026-11-19.md` > `HANDOFF_allergies-media-banner-done_2026-11-20.md` > this

> ⚠️ This repo is **PUBLIC**. This file deliberately contains no passwords, keys,
> email addresses, phone numbers, patient names/codes/addresses/allergy values,
> TextBee device IDs, NFC signatures or chip serials. Never add them.

---

## Stale References

Identifiers from the parent (seq 6) that changed on purpose this session:

- `_compose_address` (`patient_service.py:102` in parent): **renamed** to public `compose_address(*, address, house_street=None, sitio_purok=None, barangay=None, municipality=None, province=None) -> str`, plus new `patient_address(patient) -> str` in the same file.
- `effectiveAddress(parts)` (`frontend/web/lib/schemas/patient.ts`): **signature extended** with `houseStreet`; same rule as `compose_address`.
- `card_back.html:44-56` structured-address Jinja block: **replaced** by `{{ patient.address or "—" }}` (callers pass `patient_address(patient)`).
- NFC tap view `addr_parts` / `address_display = ", ".join(...)` (`health_cards.py:~254-261`): **replaced** by `address_display = _esc(patient_address(patient)) or "—"`.
- `backend/app/workers/health_card_tasks.py` (`generate_health_card_pdf_task`, `_PDF_OUTPUT_DIR`): **deleted** (PR #32). Removed from `celery_app.py` `include=[...]`.
- `CardGenerationAccepted` (backend `schemas/health_card.py` + frontend `types/healthCard.ts`): **deleted**.
- `HealthCard.generation_status` server default `'pending'`: **now `'ready'`** (migration 0030). `pdf_url` always NULL.
- Print page phase `pdf_pending`, `startPolling`, `pollingRef` (`health-cards/[patientId]/print/page.tsx`): **removed**.
- Health Cards list single-card polling loop, `POLL_INTERVAL_MS`, `genStatusRef` (`health-cards/page.tsx`): **removed**.
- Parent's "Alembic head is 0028": head is now **`0030`**.

## Since Last Handoff

- **Parent step 1 (merge handoff):** done as PR #31 (`5a5bb6e`). Merged *after* the feature PR #30 (user's order). `docs/handoff-phase10-done` and `docs/handoff-update` branches on GitHub may still exist — the user was told to delete them; not verified.
- **Parent step 2 (house/street fix):** DONE exactly as designed (2a–2j) plus extras: card-back 2-line wrap, a found-and-fixed **HTML injection** in the NFC tap view, ID-scan autofill now lands in house_street. PR #30, deployed with `deploy.sh` → `OK: commit 5a5bb6e is running`; user confirmed "works, the address shows on the card now".
- **Parent Open Questions 1–3** answered by "go, all defaults": one `house_street` column (VARCHAR 255); backfill intake patients in the migration; show it on card back + tap view.
- **Parent Open Question 4 (Celery worker writing PDFs):** answered and DONE — worker deleted, stored PDFs purged on the server (PR #32).
- **Parent Open Question 6 (prod checks a/b/c):** user answered "yes" to all three (Edit save works, old `/media` URL 404, allergy edit updates card).
- **Parent step 3 (defense items)** and **step 5 (thesis text):** thesis text now drafted (file below, uncommitted). Defense items still open (user-only tasks).
- **New, not in parent:** Health Cards list "Generate Card" spinner bug (found & fixed in #32); user-requested "after Download PDF go back to View / Print" (PR #33).
- **Trajectory:** hardening/correctness work is finishing; the user is now moving to **UX polish (sidebar)** and **System Administration capability** (their words: admin "lacks power").

## Reference Documents

- `CLAUDE.md` — conventions: Admin model B, audit every write, Alembic-only schema changes, AES-256-GCM fields, module boundaries, PHI never on NFC/QR.
- `docs/SmartHealth_Hub_System_Development_Plan.md` — authoritative schema/API/feature scope (still not read in this chain's last 2 sessions; read the admin/settings sections before designing admin modules).
- `DEV-WORKFLOW.md` — §5 Docker test DB, §6 `deploy.sh` (`bash /opt/smarthealth-hub/scripts/deploy.sh`), §11 troubleshooting.
- `plans/handoffs/HANDOFF_phase10-admin-model-b-done_2026-11-19.md` — **access matrix** (Admin/BHW/Physician/Admin Staff) — required reading for the sidebar + admin work.
- `plans/handoffs/HANDOFF_phase9-system-health-done_2026-11-19.md` — what the System Health page already does (backups status etc.).
- `docs/thesis/THESIS_DRAFT_security-privacy-integrity_2026-11-20.md` — **new**, uncommitted thesis draft (see Files Changed).
- Claude memory `deployment_setup.md` — now has a "House/street fix BUILT" paragraph: CI never runs Alembic; local Windows Postgres 18 service; rolled-back-transaction migration check.

## The Goal

SmartHealth Hub runs in production for the thesis defense (Barangay Health Center records system with NFC/QR health cards, SMS reminders, OTP MFA).
- Website `https://smarthealth-hub-two.vercel.app` (Vercel, auto-deploys on merge to `main`).
- API `https://smarthealth-hub.japaneast.cloudapp.azure.com` (Azure VM, Docker Compose, deployed by hand with `deploy.sh`).

**User's explicit next tasks, in this order:**
1. **Refine the sidebar** "for easier access for System Admin, BHW, Physician". User: "e.g. the settings, it feels like it's scattered" (screenshot of the SETTINGS / ADMINISTRATION / ACCOUNT groups).
2. **Then System Administration:** "it feels like the system administration lacks power, investigate further the features or modules that can be added to optimize the system more, and to make it more maintainable, and no issue."

## Where We Are

### Production (all verified this session)
- `origin/main` = **`d5662f2`** (merge PR #33). Backend on the server = **`62b1fb1`** (PR #32 merge; #33 is frontend-only so no backend redeploy needed).
- Alembic head **`0030`** applied in production (API started with `RUN_MIGRATIONS=true`; `entrypoint.sh` has `set -e`, so a failed migration would have stopped the API).
- Live `/openapi.json`: `PatientCreate`/`PatientUpdate` have `house_street` (maxLength 255), `PatientResponse` has it; `CardGenerationAccepted` absent; generation-status summary "Health card PDF status (always 'ready' for new cards)".
- Vercel `d5662f2`: `success - Deployment has completed`.
- Server purge: dry run "2 stored card PDF(s), 3117 KB, in /app/media/health_cards" → `--apply` "Deleted 2" → dry run 0 (user-reported).
- User confirmed in browser: address shows on card; Generate works; Download → View/Print works ("works").

### House/street (PR #30, `5e970cc`)
- New column `patients.house_street VARCHAR(255) NULL` (migration `0029_add_patient_house_street.py`), with backfill from `intake_applications.form_data->>'house_street'` and address rebuild via `concat_ws` + `nullif(btrim(...),'')`.
- **Address rule** (`patient_service.compose_address`): any location part (sitio/purok, barangay, municipality, province) non-blank → join `house_street, sitio, barangay, municipality, province` (blanks skipped, each trimmed); else free-text `address`, falling back to `house_street`; else `""`.
- `patient_address(patient)` used by: card dicts in `health_cards.py` (single `download_health_card_pdf` ~:1589, batch ~:2151), NFC tap view `_render_nfc_view_html`, summary PDF dict `patients.py:~867`.
- `_CLEARABLE_TEXT_FIELDS = {"allergies", "known_conditions", "house_street"}` (PUT with null/""/whitespace clears).
- Update recompose block in `update_patient` now triggers on `house_street` too and passes `house_street=patient.house_street`.
- Intake approval (`intake_application_service.approve_application`) passes `"house_street": fd.get("house_street")`.
- Registration page (`patients/new/page.tsx`): textarea keeps form field name `address` but is sent as `houseStreet`; `composedAddress = effectiveAddress({houseStreet: addressValue, sitioPurok, barangay, municipality, province})`; label under it "Address saved and printed on the health card: …"; `maxLength={255}`.
- Edit page: new "House No. / Street / Landmark" input (`houseStreet`, max 255, `textFieldChange` so clearing sends null); preview includes it; `FIELD_LABELS.houseStreet`.
- `HealthCardPreview.tsx`: `addressDisplay = effectiveAddress(patient) || "—"`; address span wraps to 2 lines (`WebkitLineClamp: 2`).
- `card_styles.css` `.bp-address .bp-value`: `white-space: normal; overflow-wrap: anywhere; min-width: 0; line-clamp: 2; overflow: hidden` (was `nowrap`).
- **Security fix:** NFC tap view used to insert sitio/barangay/municipality/province **unescaped**; now whole address `_esc(...)`.

### Stored PDFs (PR #32, `2f5c45b`)
- `POST /health-cards/{patient_id}/generate` no longer dispatches Celery; sets `generation_status="ready"`, `pdf_url=None` (only commits if different).
- `generation-status/{card_id}` endpoint kept for API compatibility (always "ready").
- Migration `0030_no_stored_card_pdfs.py`: server default `'ready'`; `UPDATE health_cards SET generation_status='ready', pdf_url=NULL WHERE generation_status <> 'ready' OR pdf_url IS NOT NULL`.
- `backend/scripts/purge_stored_card_pdfs.py`: `stored_card_pdfs(media_dir)`, `purge(media_dir, *, apply) -> PurgeResult(count, bytes)`, CLI dry-run default / `--apply`; `MEDIA_DIR` env or `--media-dir`; touches only `*.pdf` directly in `health_cards/`, skips symlinks/subdirs.
- `card_tasks.py` (batch) never wrote PDFs — docstring updated.
- **This PC still has 4 stored card PDFs (6166 KB) in `backend/media/health_cards/`** from local testing — NOT deleted (user's call).

### Health Cards list UX (PR #32 + #33)
- `handleGenerate` now uses `CardGenerateResponse` → `setCardMap(found, resp.card)` + `genStatus ready` + toast "Health card generated." (old code read nonexistent `resp.card_id` → row spun "Generating..." until reload).
- New `components/cards/DownloadCardPdfButton.tsx` (`{patientId, onDownloaded}`): "Downloading..." + disabled while fetching; success → `onDownloaded(patientId)`; failure → `toast.error`, stays enabled.
- List page `handleDownloaded` deletes `genStatusMap[patientId]` → row falls back to rowState "found" → **View / Print** link.

### Tests / quality (end of session)
- vitest **54 passed** (9 files) — was 43 at session start.
- DB-free pytest (`--noconftest`) **25 passed** (`test_patient_address.py` 9, `test_purge_card_pdfs.py` 4, plus 12 existing).
- CI green on `5e970cc`, `2f5c45b`, `ef33b59` (backend pytest incl. all new DB tests, mypy, ruff, tsc, eslint, builds).
- `ruff check app`, `ruff format --check app`, `mypy app` clean locally; tsc 0 errors; eslint 0 errors (pre-existing warnings only).

### Repo / PC state
- Local branch: `main` at `d5662f2` (user ran housekeeping? — the session ended with user on `main`; `git branch -d` of merged branches was suggested, not verified).
- Uncommitted (never commit without asking): `README.md` (user's ssh line ~134), `backend/celerybeat-schedule-shm`, `backend/celerybeat-schedule-wal`, `START.md`, `dump.rdb`, `start-tunnel.ps1`, **`docs/thesis/THESIS_DRAFT_security-privacy-integrity_2026-11-20.md`** (new), and this handoff file. `stash@{0}` still present; don't drop it.

## What We Tried (Chronological)

1. **Onboarding (read-only).** Read parent handoff; `bd` not installed; baseline: prod `/health` 200 in 0.27 s, vitest 43, DB-free pytest 12, Docker Desktop off (0 containers). Explored adjacent files and found: two public intake forms (`/register` with real `house_street`; `/intake` composing `house_street` = sitio + household no. + address); ID-scan autofill (`IdScanCard.tsx:110`) writes to `address`; 4 copies of the address display rule (card_back.html, tap view, HealthCardPreview, compose+effectiveAddress).
2. **Tried to run DB tests locally.** Found native Windows service `postgresql-x64-18` running (dev DB `127.0.0.1:5432/smarthealthhub`). `CREATE DATABASE smarthealthhub_test` → `InsufficientPrivilegeError` (dev role has no CREATEDB). **Fallback:** DB tests run in CI only; migrations rehearsed by executing their SQL inside a transaction on the dev DB, then ROLLBACK.
3. **House/street TDD.** `test_patient_address.py` red (ImportError `compose_address`) → implement → 21 DB-free green. DB tests (8 cases in `test_patients.py`, 2 in new `test_intake_approve.py`) ran in CI → green.
4. **Migration 0029 rehearsal.** Fake `alembic.op` captured the SQL; inserted 2 synthetic patients + intake apps in a transaction: intake patient → `house_street` trimmed, address "…, Patubig, Marilao, Bulacan"; free-text patient → address unchanged; re-run step 1 → `UPDATE 0`; after rollback column absent.
5. **ruff format** flagged 2 files only from my edits (`schemas/patient.py` long Field line, migration docstring blank line) → formatted. `test_patients.py` has 3 pre-existing ruff findings (unchanged).
6. **Card layout measurement.** No PDF rasterizer (no PyMuPDF/pdfium/pypdf). Measured via WeasyPrint layout tree (`doc.pages[0]._page_box`, walk `.children`; note `descendants()` approach failed to match). Found address `nowrap` cut at ~62 chars. First CSS override didn't apply (author sheet precedence) → used `!important` in the test sheet → 2-line clamp works; real CSS then gives same numbers.
7. **Deploy confusion (house/street).** After merge, `/openapi.json` grep for `house_street` gave 3 hits — but intake schemas already had it, so it proved nothing. Checked `components.schemas.PatientCreate.properties` instead → old backend until `deploy.sh`, then present.
8. **Stored PDF cleanup design.** Options: (a) keep worker but discard bytes; (b) remove worker, mark ready synchronously. Chose (b). Found list-page bug (`resp.card_id`). Considered deleting files inside migration → rejected (migrations shouldn't touch filesystem); wrote dry-run-first script.
9. **Migration 0030 rehearsal.** `alembic upgrade 0029:0030 --sql` printed expected SQL. Dev DB had 10 cards all `pending` (worker never ran locally) → `UPDATE 10` → all ready, default `'ready'::character varying`, re-run `UPDATE 0`, rollback restored.
10. **User ran `deploy.sh` before merging PR #32** → "Already up to date … commit 5a5bb6e", script missing (`can't open file '/app/scripts/purge_stored_card_pdfs.py'`). Diagnosed: PR #32 open, not merged. Harmless.
11. **User ran purge from `/`** → `couldn't find env file: /.env.server`. Fix: `cd /opt/smarthealth-hub` first.
12. **Download → View/Print (PR #33).** Next.js App Router page files can't export extra components, so extracted `DownloadCardPdfButton` for testability (icons are shared in the page, so only the button moved). TDD: 3 tests red (import missing) → green.
13. **Thesis draft** written to `docs/thesis/…` (not committed — public repo).
14. **Handoff prep:** read `Sidebar.tsx` NAV_GROUPS and `system_config.py` guards (see Code Analysis) to seed the sidebar task.

## Key Decisions

- **One `house_street` column**, not house_number/street/landmark. Why: the registration textarea is one free-text field; matches both intake forms' `house_street` (max 255). Rejected: 3 columns (new fields nobody asked for).
- **Location parts decide the rule; house_street alone never replaces a free-text address.** Why: older patients only have free text; recomposing with `[house_street, address]` would duplicate text on every save. Rejected: always prefix house_street.
- **Registration textarea keeps field name `address`** (sent as `houseStreet`). Why: `patientCreateSchema` is shared by `/intake` and `/intake/[token]`, and OCR autofill maps to `address`. Rejected: renaming in the shared schema (3 public forms touched).
- **One display rule, computed at display time** (`patient_address`) rather than trusting stored `address`. Why: protects legacy rows; removes 4 copies of the rule.
- **Backfill only intake patients**; staff-registered text is unrecoverable (never stored) → re-enter via Edit.
- **Card back: 2-line clamp**, not smaller font. Measured spare height on a fully filled back panel (+17.8 px with clamp).
- **Remove the Celery PDF worker entirely**, set status `ready` synchronously. Rejected: keep worker rendering and discarding bytes (pure CPU waste); rejected: delete files inside migration 0030 (irreversible filesystem side effects in a DB migration) → separate dry-run-first script.
- **Make `generation_status` default `'ready'`** in 0030. Why: batch-generated cards stayed `pending` forever (only the single-card task ever advanced them).
- **Extract only the Download button** for testing, not the whole ActionCell (shared icons).
- **Thesis draft stays uncommitted** — repo is public; user decides.
- **The local 4 card PDFs on the PC were not deleted** — user's files; told them the command.

## Evidence & Data

### Commit / PR log (this session, all merged to `main`)
| PR | Branch | Commit | Merge | Summary | Files |
|---|---|---|---|---|---|
| #30 | feat/patient-house-street | `5e970cc` | `d7aa10c` | house_street column + one address rule + card wrap + tap-view escaping | 21 (+672/−67) |
| #31 | docs/handoff-phase11 | `8979f27` | `5a5bb6e` | parent handoff + seq-5 handoff files | 2 |
| #32 | fix/no-stored-card-pdfs | `2f5c45b` | `62b1fb1` | stop storing card PDFs; migration 0030; purge script; list Generate fix | 13 (+302/−590) |
| #33 | feat/download-back-to-view | `ef33b59` | `d5662f2` | DownloadCardPdfButton; row returns to View / Print | 3 (+136/−16) |

### CI (GitHub check-runs, all completed/success; Changelog + auto-merge skipped)
| Commit | Backend pytest | mypy | Backend lint | tsc | Frontend lint | Backend build | Frontend build | Vercel |
|---|---|---|---|---|---|---|---|---|
| `5e970cc` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (`d7aa10c` deployed) |
| `2f5c45b` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (`62b1fb1` deployed) |
| `ef33b59` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (`d5662f2` deployed) |

### Deploy & verification per PR
| PR | Backend deploy | Server result | User-verified |
|---|---|---|---|
| #30 | yes | `OK: commit 5a5bb6e is running` | ✅ "works, the address shows on the card now" |
| #32 | yes (1st try before merge = no-op) | `OK: commit 62b1fb1 is running`; purge dry run 2 files/3117 KB → applied → 0 | ✅ "generate works" |
| #33 | no (frontend) | Vercel success | ✅ "works" |

### Test count history
| Point | vitest | DB-free pytest | New DB tests (CI) |
|---|---|---|---|
| Session start | 43 | 12 | — |
| After #30 | 51 (+4 effectiveAddress, +2 edit schema, +2 HealthCardPreview) | 21 (+9) | +8 `test_patients.py`, +2 `test_intake_approve.py` |
| After #32 | 51 | 25 (+4 purge) | +1 `test_generate_stores_no_pdf_and_is_ready_at_once` |
| After #33 | 54 (+3 DownloadCardPdfButton) | 25 | — |

### Card-back address fit (WeasyPrint layout measurement, CSS px)
| Address length | CSS | Lines | Widest | Available | Fits | Panel spare |
|---|---|---|---|---|---|---|
| 25 | nowrap (old) | 1 | 65.3 | 162.9 | yes | +24.7 (full patient) |
| 49 | nowrap (old) | 1 | 125.9 | 162.9 | yes | +76.4 (minimal patient) |
| 79 | nowrap (old) | 1 | 202.0 | 196.4 | **NO (cut)** | +24.7 |
| 25 | 2-line clamp | 1 | 65.3 | 162.9 | yes | +17.8 |
| 79 | 2-line clamp | 2 | 157.8 | 162.9 | yes | +17.8 |
| 242 | 2-line clamp | 2 (clamped) | 147.5 | 162.9 | yes (tail cut) | +17.8 |

### Migration rehearsals (dev DB, rolled back)
| Migration | Setup | Result | Re-run | After rollback |
|---|---|---|---|---|
| 0029 | 2 synthetic patients + intake apps | step1 `UPDATE 2`, step2 `UPDATE 1`; intake patient address rebuilt; free-text unchanged | `UPDATE 0` | column gone |
| 0030 | 10 real dev cards all `pending`, no pdf_url | `UPDATE 10` → all `ready`; default `'ready'` | `UPDATE 0` | back to 10 `pending` |

### Prod verification commands that worked
```bash
curl -s https://smarthealth-hub.japaneast.cloudapp.azure.com/openapi.json | python -c "import sys,json; s=json.load(sys.stdin)['components']['schemas']; print('house_street' in s['PatientCreate']['properties'])"
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/<sha>/check-runs"   # CI
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/commits/<sha>/status"       # Vercel
curl -s "https://api.github.com/repos/crud-j/smarthealth-hub/pulls?head=crud-j:<branch>&state=all"  # PR open/merged?
```

### Server commands (run at `azureuser@smarthealth-server:/opt/smarthealth-hub$`)
```bash
bash /opt/smarthealth-hub/scripts/deploy.sh
docker compose -f docker-compose.server.yml --env-file .env.server exec backend python scripts/purge_stored_card_pdfs.py          # dry run
docker compose -f docker-compose.server.yml --env-file .env.server exec backend python scripts/purge_stored_card_pdfs.py --apply  # delete
```
(Compose service is **`backend`**, not `api`. Must `cd /opt/smarthealth-hub` first or `.env.server` is not found.)

### Timeline (user prompt → outcome)
| # | User said | Outcome |
|---|---|---|
| 1 | Paste prompt (seq 6) + "wait for my go-ahead" | Onboarding narration; 3 design questions with one recommendation each |
| 2 | "go, all defaults" + "yes" (prod checks a/b/c all fine) | House/street built (PR #30), tests + migration rehearsal |
| 3 | "merged, check it." | Both #30 and #31 merged; backend NOT yet deployed (schema check) |
| 4 | "OK: commit 5a5bb6e is running" | Verified `house_street` in live schemas; migration 0029 applied |
| 5 | "works, the address shows on the card now, what is next?" | Recommended stored-PDF cleanup |
| 6 | "go, stored PDF cleanup" | PR #32 built (worker removed, 0030, purge script, list bug fix) |
| 7 | Deploy output before merge + script missing | Diagnosed PR #32 still open; merge first |
| 8 | "OK: commit 62b1fb1 is running" + `/.env.server` error | `cd /opt/smarthealth-hub` first |
| 9 | Dry run "2 stored card PDF(s), 3117 KB" | Gave `--apply` + confirm dry run |
| 10 | "Deleted 2, dry run shows 0, generate works" + Download→View/Print request | PR #33 built |
| 11 | "merged, check it" | Verified #33 CI + Vercel |
| 12 | Sidebar screenshot + "draft the thesis text … /handoff … sidebar first then system administration" | Thesis draft file + this handoff |

### Intake / OCR address facts (learned while building #30)
- `/register` (public) has a real "House No. / Street" input → `house_street` (max 255) in `intake_applications.form_data`.
- `/intake` (public, `app/intake/page.tsx:417`) builds `house_street = [sitioPurok, householdNumber, address].join(", ")`; approval does NOT pass `sitio_purok`/`household_number` to the patient, so the sitio lives inside `house_street` for those patients (no duplication).
- `/intake/[token]` (pre-visit, `patientIntakeSchema`) sends `address` (Complete Address) — untouched by #30.
- `IdScanCard.tsx:110` maps the ID's `address_line` → form field `address` → now saved as `house_street`. If the ID line already contains the barangay, it can appear twice in the composed address; the live preview shows it so staff can trim. Not fixed (judgment call by staff).
- Backend `PatientCreate.address` is optional (`max_length=500`); registration still sends `address = composedAddress`.

### Sidebar as it is now (`frontend/web/components/layout/Sidebar.tsx` `NAV_GROUPS`, ~lines 156-203)
| Group | Item | href | roles (empty = everyone) |
|---|---|---|---|
| Overview | Dashboard | /dashboard | all |
| Patient Care | Patients | /patients | all |
| Patient Care | Appointments | /appointments | all |
| Patient Care | Registrations | /registrations | admin, bhw, admin_staff, physician |
| Patient Care | Immunizations | /immunizations | all |
| Patient Care | Health Cards | /health-cards | all |
| Insights | Analytics | /analytics | admin, bhw, physician |
| Insights | SMS Logs | /sms-logs | admin, bhw |
| Settings | Settings | /settings | **all** |
| Administration | Users | /settings/users | admin |
| Administration | Audit Log | /settings/audit-log | admin |
| Administration | System Health | /settings/system-health | admin |
| Administration | Online Registrations | /settings/intake-applications | admin |
| Administration | Registration QR | /settings/registration-qr | admin, bhw, admin_staff |
| Administration | Patient Archive | /patients/archived | admin, physician |
| Account | Profile | /settings/profile | all |
| Account | Security | /settings/security | all |

Filter: `item.roles.length === 0 || item.roles.includes(role)`; empty groups hidden (`Sidebar.tsx:~266-271`).

## Code Analysis

### Sidebar findings (seed for next session — verify by reading the code)
- **Bug: "Settings" (`/settings`) is visible to every role, but the page calls `GET /api/v1/system/info`, which is `require_role("admin")` (`system_config.py:38 AdminOnly`, endpoint at `:45`)**. Non-admins clicking it get "Could not load system configuration". The page itself is "System Configuration — Read-only — change values via environment variables" (`settings/page.tsx:156-160`), with links to Users / Audit Log / System Health (`:237-263`).
- A one-item "Settings" group sits next to "Administration" and "Account", whose items also live under `/settings/*` — the "scattered" feeling the user described.
- **"Registrations" (Patient Care, `/registrations`) vs "Online Registrations" (Administration, `/settings/intake-applications`)** — two similar names; the user may not know which is which. Check what each page does before renaming/merging.
- **"Registration QR"** is in Administration but visible to bhw/admin_staff; **"Patient Archive"** is in Administration but visible to physician → non-admins see an "Administration" group containing only these.
- `frontend/web/app/(dashboard)/users/` is an **empty directory** (Users page lives at `/settings/users`).
- `/nfc-monitor` (staff-only NFC relay monitor, `frontend/web/app/nfc-monitor`) is **not in the sidebar** (outside the `(dashboard)` layout) — decide whether it needs a link.
- Role keys: `admin`, `bhw`, `physician`, `admin_staff` (Sidebar uses `user?.role?.toLowerCase()`). `lib/permissions.ts` exports `canAccessClinicalPhi`, `canLogVisit`, `canDeleteImmunization` — sidebar roles are hard-coded arrays, not these helpers.
- Backend system endpoints (`app/api/v1/endpoints/system_config.py`, router prefix `/system`): `GET /info` (admin), `GET /status` (admin; System Health), `GET /registration-url` (all authenticated staff).
- Backend endpoint modules: `ai_analytics, analytics, appointments, audit (2 routes), auth, health_cards, immunizations, intake, intake_applications, medical_history, mfa, passkey, patient_photos, patients, sms, system_config, users (7 routes)`.

### Address / card facts
- `compose_address` and `effectiveAddress` must stay identical; shared test cases in `backend/tests/test_patient_address.py` ↔ `frontend/web/tests/lib/patient-edit-schema.test.ts`.
- Jinja `_jinja_env` in `pdf_renderer.py` uses `select_autoescape(["html"])`; NFC tap view is a Python f-string → must `_esc()` every value.
- `_esc(value)` (`health_cards.py:207`) → `html.escape(str(value))` or `""` for None.
- WeasyPrint render for measurement: `HTML(string=..., base_url=pdf_renderer._TEMPLATE_DIR.as_uri() + "/").render()`; walk `box.children`; `box.element.get("class")`.

### Infra facts
- `docker-compose.server.yml`: services `caddy, backend, worker, beat, db, redis, backup`; `MEDIA_DIR: /app/media`; volume `media:/app/media`; backup service mounts `media:/media:ro`, `BACKUP_KEEP_DAYS` default 14, writes `db-*.dump` + `media-*.tar.gz` to `/var/backups/smarthealth`.
- `backend/scripts/entrypoint.sh`: `set -e`; `alembic upgrade head` when `RUN_MIGRATIONS=true`.
- CI (`.github/workflows/ci.yml`): `ruff check backend/app`, `ruff format --check backend/app` (tests NOT format-checked), `mypy app --ignore-missing-imports`, pytest on `postgres:16-alpine` with `create_all` (**no Alembic**).
- Dockerfile copies `app`, `alembic`, `alembic.ini`, `pyproject.toml`, `scripts` into `/app`.

## Files Changed

### Backend source
- `backend/app/models/patient.py` (#30): `house_street String(255)`.
- `backend/app/schemas/patient.py` (#30): `house_street` on Create/Update (max 255, stripped) and Response.
- `backend/app/services/patient_service.py` (#30): `compose_address`, `patient_address`, clearable `house_street`, create/update wiring.
- `backend/app/services/intake_application_service.py` (#30): passes `house_street`.
- `backend/app/api/v1/endpoints/patients.py` (#30): response `house_street`; summary PDF uses `patient_address`.
- `backend/app/api/v1/endpoints/health_cards.py` (#30, #32): `patient_address` everywhere + escaped tap view; generate without Celery; status docs.
- `backend/app/templates/health_card/card_back.html`, `card_styles.css` (#30): single address value; 2-line clamp.
- `backend/app/models/health_card.py`, `schemas/health_card.py` (#32): default `ready`; `CardGenerationAccepted` removed.
- `backend/app/workers/health_card_tasks.py` (#32): **deleted**; `celery_app.py` include removed; `card_tasks.py` docstring.
- `backend/alembic/versions/0029_add_patient_house_street.py` (#30), `0030_no_stored_card_pdfs.py` (#32).
- `backend/scripts/purge_stored_card_pdfs.py` (#32, new).

### Frontend source
- `frontend/web/lib/schemas/patient.ts` (#30): `effectiveAddress` + `houseStreet` in edit schema.
- `frontend/web/types/patient.ts`, `hooks/usePatients.ts` (#30): `houseStreet` / `house_street` mapping.
- `frontend/web/app/(dashboard)/patients/new/page.tsx`, `[patientId]/edit/page.tsx` (#30).
- `frontend/web/components/cards/HealthCardPreview.tsx` (#30).
- `frontend/web/app/(dashboard)/health-cards/page.tsx` (#32, #33), `[patientId]/print/page.tsx` (#32), `types/healthCard.ts` (#32).
- `frontend/web/components/cards/DownloadCardPdfButton.tsx` (#33, new).

### Tests
- Backend: `tests/test_patient_address.py` (new, 9 DB-free), `tests/test_intake_approve.py` (new, 2 DB), `tests/test_patients.py` (+8 DB cases), `tests/test_purge_card_pdfs.py` (new, 4 DB-free), `tests/test_health_cards.py` (+1 DB, `settings` import).
- Frontend: `tests/lib/patient-edit-schema.test.ts` (+6), `tests/components/HealthCardPreview.test.tsx` (new, 2), `tests/components/DownloadCardPdfButton.test.tsx` (new, 3).

### Docs / memory (uncommitted or outside repo)
- `docs/thesis/THESIS_DRAFT_security-privacy-integrity_2026-11-20.md` (new, **local only — `docs/` is git-ignored**, `.gitignore:3`): sections 4.X Admin model B (access table), allergy safety, 3 security issues (/media A01, stored PDFs data minimization, tap-view injection A03), house/street integrity, verification approach, summary table, limitations, references (RA 10173, OWASP Top 10 2021, NIST SP 800-38D), suggested figures.
- Claude memory `deployment_setup.md`: appended "House/street fix BUILT 2026-11-20 … CI never runs Alembic … local postgresql-x64-18 … rolled-back transaction check".
- Scratchpad `C:\Users\githu\AppData\Local\Temp\claude\1adbc46cbc659d4e\97e51f15-e870-4219-8368-1b720b1175e8\scratchpad\`: `commit-house-street.txt`, `pr-body-house-street.md`, `commit-no-stored-pdfs.txt`, `pr-body-no-stored-pdfs.md`, `commit-download-back-to-view.txt`, `pr-body-download-back-to-view.md`, `dbcheck.py`, `migcheck.py` (0029), `mig0030check.py`, `cardfit2.py`/`cardfit3.py`/`addr2.css` (WeasyPrint measurement), `card-house-street-test.pdf`.

## User Feedback & Preferences (REQUIRED)

- **"go, all defaults"** (twice: house/street design; stored-PDF cleanup) — accept the single recommendation; act without re-asking.
- **"merged, check it" / "merged"** — always verify first: `git fetch`, `git log origin/main`, `git show --stat`, CI check-runs, Vercel status, and for backend `/openapi.json` **schema-level** checks. Report as a table.
- **Runs `deploy.sh` before merging sometimes** — when told "deploy after merge", also remind "merge PR #N first"; check PR state via GitHub API when a script/file is "missing" on the server.
- **Runs server commands from the wrong directory** — always prefix with `cd /opt/smarthealth-hub` and state the expected prompt (`…:/opt/smarthealth-hub$`).
- **Pastes full terminal output** — read it end to end (e.g. "Already up to date … commit 5a5bb6e" revealed the unmerged PR).
- **Commits/pushes/merges themselves.** Give one command per line, exact `git add` paths (quote paths with `()`/`[]`), `git commit -F <scratchpad file>`, compare URL, PR-body file path, expected output ("Expect `21 files changed`").
- **Wants feature-level UX follow-ups** ("when it download, it will go back to the view/print").
- **Short confirmations close items:** "works", "works, the address shows on the card now", "Deleted 2, dry run shows 0, generate works".
- **Next-session order is explicit:** sidebar FIRST, then System Administration.
- **Sidebar request (verbatim intent):** "refine the sidebar (for easier access for System ad, BHW, Physician … e.g. the settings, it feels like it's scattered, view the image provided)".
- **Admin request (verbatim intent):** "the system administration lacks power, investigate further the features or modules that can be added to optimize the system more, and to make it more maintenance properly, and no issue".
- **Thesis:** wants a markdown file "that I can look after when I'm ready" — not to be pushed into the manuscript now.
- (Carried) Screenshots everything; never secrets or patient details in output; never send them into nano/cat on .env files.

## Where We're Going

1. **Housekeeping (PC, PowerShell):** confirm on `main` at `d5662f2` or later; delete merged local branches (`git branch -d feat/download-back-to-view fix/no-stored-card-pdfs feat/patient-house-street docs/handoff-phase11`); merge the `docs/handoff-seq7` PR (this handoff) if not done yet. The thesis draft is local-only (`docs/` is git-ignored).
2. **SIDEBAR (first, user-requested).** Read `components/layout/Sidebar.tsx`, the Phase 10 access matrix, and each `/settings/*` page. Propose ONE recommended grouping per role (Admin / BHW / Physician / Admin Staff) with a before/after table, then implement:
   - fix the `/settings` link shown to non-admins (admin-only page);
   - merge the lone "Settings" group with Administration (e.g. "System Configuration" under Administration) or move to a role-aware layout;
   - move Registration QR / Patient Archive out of "Administration" for non-admin roles (or into Patient Care);
   - clarify "Registrations" vs "Online Registrations";
   - consider deriving sidebar roles from `lib/permissions.ts` helpers so they stay in sync with backend guards; add vitest that pins visible items per role.
3. **SYSTEM ADMINISTRATION (second).** Inventory what admin can do today (Users, Audit Log, System Health, System Configuration read-only, Online Registrations, Registration QR, Patient Archive; plus SMS logs/analytics) vs the SDP. Research and propose modules, e.g.: editable runtime settings (clinic name, SMS templates, reminder schedule) stored in DB with audit; backup management (list/download/verify-restore trigger, last-backup alerts); user lifecycle (lock/unlock, forced password reset, MFA reset, session revoke, last login); audit log search/export; SMS gateway status/credit; data retention/purge jobs; maintenance mode; health-card stock/NFC chip registry. Keep **Admin model B** (no clinical PHI). One recommended plan, then TDD.
4. **Defense readiness (user items, remind once):** load gateway SIM + test SMS; write final NTAG215 from the demo patient's Print page; deactivate the allergy test patient; regenerate demo card PDFs; re-enter house/street for demo patients registered before 2026-11-20.
5. **Optional cleanups (ask first):** `datetime.utcnow()` / `HTTP_422_UNPROCESSABLE_ENTITY` deprecations; ruff findings in old tests (`test_patients.py` I001/F401, `test_health_cards.py` formatting); pre-existing eslint warnings; delete the PC's 4 local stored card PDFs (`python scripts/purge_stored_card_pdfs.py --apply` from `backend`); empty `app/(dashboard)/users/` dir.

## Risks & Blockers

- **Sidebar role arrays are frontend-only.** Hiding a link isn't access control; backend `require_role` stays authoritative. Changing groups must not expose admin-only pages to other roles (the `/settings` case already does — it errors rather than leaks).
- **Admin features vs Admin model B:** any new admin module must not surface decrypted clinical PHI (diagnosis, treatment notes, medical-history notes). Allergies/known conditions are visible to all staff by design.
- **New admin settings stored in DB = schema change** → Alembic migration (`0031`+); CI won't run it → rehearse in a rolled-back transaction on the dev DB.
- **VM auto-shuts down at 23:00 Manila;** prod checks time out → ask the user to start it (Azure portal → Virtual machines → smarthealth-server → Start).
- **Old backups** still contain the 2 deleted card PDFs until ~2026-12-04 (14-day retention).
- (Carried) `POSTGRES_PASSWORD` / `ENCRYPTION_KEY` not rotated; gateway SIM has no load (SMS fails silently at the carrier).

## Open Questions

1. Which role does the user log in as most during the defense demo? (Drives which sidebar layout to optimize first.)
2. Should non-admin staff see a read-only "System Configuration" at all, or only admins? (Recommend: admin only.)
3. Are "Registrations" and "Online Registrations" the same workflow at different stages? (Read both pages before proposing a merge.)
4. Which admin modules matter for the thesis objectives vs nice-to-have? (Check SDP scope before building.)
5. ~~Commit the thesis draft?~~ Answered at close: `docs/` is git-ignored, so it stays local automatically.

## Quick Start for Next Session

```bash
# Reference docs (read first)
cat plans/handoffs/HANDOFF_sidebar-and-admin-next_2026-11-20.md
cat CLAUDE.md
# Phase 10 access matrix: plans/handoffs/HANDOFF_phase10-admin-model-b-done_2026-11-19.md (section "Access matrix after Phase 10")
# SDP admin scope: docs/SmartHealth_Hub_System_Development_Plan.md

# Key files for the sidebar (explore adjacent code too)
frontend/web/components/layout/Sidebar.tsx          # NAV_GROUPS ~156-203, role filter ~266
frontend/web/app/(dashboard)/settings/page.tsx      # "System Configuration" (calls admin-only /system/info)
frontend/web/app/(dashboard)/settings/*/page.tsx    # users, audit-log, system-health, intake-applications, registration-qr, profile, security
frontend/web/app/(dashboard)/registrations/         # vs settings/intake-applications
frontend/web/lib/permissions.ts                     # role helpers mirroring backend guards
backend/app/api/v1/endpoints/system_config.py       # /system/info, /system/status (admin), /system/registration-url

# Verify current state (PowerShell on PC)
git fetch --prune; git checkout main; git pull; git log --oneline -3     # expect d5662f2 or later
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health  # timeout → VM off
cd frontend/web; npx vitest run                                          # expect 54 passed
cd backend; python -m pytest tests/test_patient_address.py tests/test_purge_card_pdfs.py --noconftest -q   # expect 13 passed

# Next action
# Propose ONE recommended sidebar layout per role (before/after table, incl. the /settings-for-everyone bug),
# get the user's go, then implement with a vitest that pins visible items per role.
```

## Session Closed
**Closed at:** 2026-11-20 (Manila, UTC+8)
**Commit:** the `session: sidebar-and-admin-next [standalone-9d299342]` commit on branch `docs/handoff-seq7` that includes this note (run by the user from the commands Claude provided; merge via PR, docs only, no server update needed). The thesis draft `docs/thesis/THESIS_DRAFT_security-privacy-integrity_2026-11-20.md` is NOT in that commit: the whole `docs/` folder is git-ignored (`.gitignore:3`), so it stays local-only on the PC (it is not in the repo and not in any backup Claude knows of; OneDrive syncs the folder).
**Session status:** Handed off to next session
