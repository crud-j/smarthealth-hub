# Handoff: Filipino SMS copy and defense readiness

**Date:** 2026-11-22 (Manila)
**Status:** In progress — Filipino SMS copy updated locally; focused tests and
  static checks pass; full backend pytest is blocked because Docker Desktop is
  not running.
**Chain:** `standalone-9d299342`, continuing after seq 12
**Current branch:** `fix/filipino-sms-copy`, based on `main` at `ccd12a2`

> The repository is public. This note contains no secrets, patient names or
> codes, OTPs, phone numbers, or email addresses.

## Where to start

Finish verification of the Filipino SMS copy change. Start Docker Desktop and
wait for its Linux engine to be ready. From `backend/`, run these commands one
at a time. Never run two pytest processes against `shh-test-pg` concurrently.

```powershell
docker run -d --rm --name shh-test-pg -e POSTGRES_USER=shh_test -e POSTGRES_PASSWORD=shh_test -e POSTGRES_DB=smarthealthhub_test -p 127.0.0.1:5499:5432 postgres:18-alpine
docker run -d --rm --name shh-test-redis -p 127.0.0.1:6399:6379 redis:7-alpine
$env:DATABASE_URL="postgresql+asyncpg://shh_test:shh_test@127.0.0.1:5499/smarthealthhub_test"; $env:REDIS_URL="redis://127.0.0.1:6399/0"; python -m pytest -p no:warnings -o addopts="" -q
docker stop shh-test-pg shh-test-redis
```

Docker was unavailable on the last attempt. Both `docker run` calls failed
because `dockerDesktopLinuxEngine` was not present, so **the full backend suite
has no result yet**. Start Docker Desktop before retrying. Do not report the
failed container launch as a pytest result.

## Current code change

The user asked to review and improve the Filipino SMS templates. The update:

- Revises the Filipino appointment, immunization, and missed-appointment
  defaults, with an explicit `STOP para ihinto ang SMS` opt-out instruction.
- Preserves the `STOP` and `CONFIRM` keywords used by SMS handling. The
  appointment confirmation sentence now uses Filipino: `CONFIRM #### para
  kumpirmahin.`
- Sets the appointment template limit to 135 characters in English and 129 in
  Filipino so the complete SMS remains within 160 characters.
- Adds tests for the Filipino copy, opt-out instruction, confirmation suffix,
  message length, and the Settings character limit.

Files in the staged change:

- `backend/app/services/sms_templates.py`
- `backend/app/services/system_settings_service.py`
- `backend/app/workers/reminder_scheduler.py`
- `backend/tests/test_sms_templates.py`
- `backend/tests/test_system_settings.py`

The copy is an editorial draft, **not externally validated by a Filipino
native speaker**. Existing custom template values in production
`system_settings` are not overwritten by changing the code defaults. The new
defaults will apply after merge/deploy only where there is no custom override.

## Verification so far

- `python -m pytest --noconftest -o addopts="" -q tests/test_sms_templates.py`:
  **22 passed** (0.15 s), before the final `language` → `lang` name correction
  in `system_settings_service.py`.
- `python -m ruff check app`: **All checks passed** after that correction.
- `python -m ruff format app`: reformatted 1 file; 117 unchanged.
- `python -m ruff format --check app`: **118 files already formatted**.
- `python -m mypy app --ignore-missing-imports`: **Success**, 118 source files,
  after the correction.
- Frontend `pnpm exec tsc --noEmit`: passed (no output).
- Frontend `pnpm run test`: **206 passed** across 28 files.
- Frontend `pnpm run lint`: **0 errors, 81 warnings**. No frontend files changed.
- `git diff --check`: passed.
- Full backend pytest: **not run**; Docker engine unavailable.

## Git state and user-owned files

The five code/test files above are already staged. The staged stat was **5 files
changed, 55 insertions(+), 12 deletions(-)**. The handoff itself is a new,
unstaged file. No commit, push, PR, merge, or production deployment has been
performed.

Other local changes are intentionally untouched:

- Unstaged `README.md`
- Unstaged `backend/celerybeat-schedule-shm` and
  `backend/celerybeat-schedule-wal`
- Untracked `START.md`, `dump.rdb`, and `start-tunnel.ps1`
- Preserve `stash@{0}`; never drop it.

Do not edit, stage, or commit those files. After the full backend suite passes,
verify the staged stat again, then give the user the explicit commit, push, and
PR instructions. The user commits, pushes, opens/merges PRs, and deploys; the
assistant does not.

## Production and defense-readiness context

- `origin/main` and local `main` were at `ccd12a2` (PR #61) before the new
  feature branch was created.
- User reported Settings → System Health showed the same version; production
  `/health` returned `{"status":"ok","service":"smarthealth-hub-api","version":"0.1.0"}`.
- User still has no SIM load and has not written the final NTAG215. These remain
  deferred.
- OTP email still has no app-provided clickable copy button; email clients
  control their own copy affordances. The user reports manually selecting the
  code chip to copy it.
- Other defense items still open: fill Sitio/Purok for demo patients in the UI,
  deactivate the allergy test patient in the UI, native-speaker review of
  Filipino SMS, and manuscript wording. `docs/` is explicitly read-only under
  the user's project rules; do not edit it.
- Manuscript wording discussed in this session: use Recharts specifically;
  WeasyPrint renders HTML/CSS PDFs; browser Web Workers (Comlink) run on the
  user's device; describe email OTP and passkeys accurately (passkey is an
  alternative sign-in method). The local thesis draft was not modified.

## Session trajectory

1. Confirmed the next handoff item was #61 deployment confirmation. User
   reported `/health` is healthy and System Health shows the same version.
2. User reported the OTP email has no clickable copy button. Existing design
   relies on email-client behavior; the in-email JavaScript clipboard approach
   discussed in the prior handoff is not available.
3. User moved to defense-readiness work, excluding SIM and NFC due to no load
   and no final chip write.
4. Reviewed built-in Filipino SMS templates and revised them with tests. Fixed
   Ruff/mypy finding (`language` was undefined; changed to loop variable
   `lang`). User's subsequent Ruff and mypy runs passed.
5. Focused test and frontend checks passed. Full backend tests remain pending
   solely because Docker Desktop was not running.

## Resume instructions

Start with the Docker-backed full backend test above. If it passes, report the
actual pytest count and proceed to the user's staging/PR workflow. Do not guess
the full-suite count. After the change is merged, the backend needs the
user-run server deploy via `bash /opt/smarthealth-hub/scripts/deploy.sh`; then
the user should check Settings → System Health and review a Filipino reminder
through the app's configured template path.

## Update (later the same day)

- Docker Desktop started; full backend suite on `fix/filipino-sms-copy`:
  **584 passed** in 162 s (582 before + the 2 new template tests).
- Staged stat re-checked: 5 files changed, 55 insertions(+), 12 deletions(-);
  no unstaged edits on those files.
- Commit message and PR body prepared; the user commits, pushes and opens the
  PR. This note ships in the docs PR together with the seq 12 handoff
  (`docs/handoff-seq12`).
