# SmartHealth Hub is LIVE (Vercel + Azure Japan East); next is Phase 7, writing signed NFC chips

**Date:** 2026-11-18
**Status:** IN PROGRESS. Production deployment done and verified (login + demo data work). Phase 7 (NFC chips) and Phase 8 (backups) not started.
**Bead(s):** none (`bd` CLI not installed on this PC)
**Epic:** Deploy SmartHealth Hub to production (Vercel frontend + Linux/Docker backend)
**Chain:** `standalone-9d299342` seq `2`
**Parent:** `HANDOFF_vercel-docker-deploy_2026-11-17.md`
**Prior chain:** `HANDOFF_vercel-docker-deploy_2026-11-17.md` > this

> ⚠️ This repo is **PUBLIC**. This file deliberately contains no passwords, keys,
> email addresses or secret values. Never add them here.

---

## Since Last Handoff

- **Parent step 1 (Docker cleanup of `shh-verify`)**: still NOT done. Docker Desktop on the PC was not running all session (`dockerDesktopLinuxEngine` pipe missing). Still pending.
- **Parent step 2 (confirm session commit)**: confirmed `b64c493` existed on `deploy/vercel-docker-prod`. The user chose to keep `backend/alembic/versions/0003_medical_history.py` uncommitted at first ("leave the migration file"). That later turned out to be **required** for a fresh DB and was committed (PR #17).
- **Parent step 3 (push + CI)**: CI was NOT green as the parent expected. It failed on 4 independent problems (ruff format, CI DB name, mypy with redis-py 8.x, invalid 28-byte CI encryption key) plus coverage 52% < 70%. All were fixed across 2 commits, then PR #16 was merged to `main` (merge `724e61f`).
- **Parent step 4 (actual deployment)**: DONE, but on **Azure for Students** (Japan East), not a generic VPS / sslip.io as DEPLOY.md assumes. The user has no credit card (Oracle/DigitalOcean impossible) and their GitHub Student Pack had lapsed.
- **Parent risk "ENCRYPTION_KEY / QR_HMAC_SECRET mismatch"**: moot. The user chose **fresh demo data**, so the server got **newly generated** secrets (not copied from dev).
- **Parent risk "Let's Encrypt + sslip.io rate limits"**: avoided. We used Azure's free DNS label `smarthealth-hub.japaneast.cloudapp.azure.com`. Let's Encrypt still failed at first, because the Azure NSG lacked ports 80/443 (fixed).
- **Parent open questions answered**: VPS = Azure B2als_v2 Japan East. Data = fresh `seed_db.py`. NFC reader = **NFC Tools app on Samsung Galaxy S21** (URL records; no relay/UID app). Legacy infra files: still unanswered.
- **New**: `DEV-WORKFLOW.md` written (day-to-day process doc). It is NOT committed yet.

## Reference Documents

- `DEV-WORKFLOW.md` (repo root, committed at session close on branch `docs/dev-workflow`): the agreed day-to-day process: branch → PR → CI → merge, Vercel auto-deploy, server update command, migration rules, settings/secrets, cheat sheet, troubleshooting, don'ts, working agreements with Claude. **Read this first.**
- `DEPLOY.md`: first-time server setup guide (generic VPS + sslip.io). Our real setup differs; `DEV-WORKFLOW.md §1` has the real values.
- `CLAUDE.md`: project conventions (no PHI on NFC/QR, audit every write, Alembic for schema, AES-256-GCM on `medical_history.notes`, `visits.diagnosis`, `visits.treatment_notes`). Says Next.js 15; actual is 16.2.10.
- `plans/handoffs/HANDOFF_vercel-docker-deploy_2026-11-17.md`: parent (seq 1). Has the NFC security design, the compose stack details, the "NFC System Map" section and the "Deployment Configuration Contract".
- `START.md` (untracked, user's own): local dev startup.
- Claude memory: `deployment_setup.md` (updated heavily this session with server facts), `pnpm_not_npm.md`, `project_scaffold.md`.

## The Goal

SmartHealth Hub (thesis project: Barangay Health Center records system with NFC/QR health cards, SMS reminders and OTP MFA) runs **in production on the internet**: staff use `https://smarthealth-hub-two.vercel.app` from anywhere. A phone tapping a patient's NFC card opens that patient's summary from anywhere, served by the Azure backend over HTTPS behind a **signed link** (card numbers are sequential, so the signature prevents enumeration; Data Privacy Act concern). This session brought it live. **The next session's job is Phase 7: write signed NFC links onto physical chips with the NFC Tools app on the user's Samsung Galaxy S21, and verify taps end-to-end.** After that comes Phase 8 (daily DB backups + safe copy of ENCRYPTION_KEY).

## Where We Are

- **Live website**: https://smarthealth-hub-two.vercel.app (Vercel project `smarthealth-hub`; `-two` suffix because the name was taken). Build succeeded: Next.js 16.2.10 Turbopack, 33/33 static pages, 55 s.
- **Live API**: https://smarthealth-hub.japaneast.cloudapp.azure.com. `curl /health` → `{"status":"ok","service":"smarthealth-hub-api","version":"0.1.0"}`. Valid Let's Encrypt cert via Caddy.
- **Server**: Azure VM `smarthealth-server`, resource group `smarthealth-rg`, region **japaneast**, size **Standard_B2als_v2** (2 vCPU / 4 GiB, ~$38–39/month), Ubuntu 24.04.5 LTS (kernel 7.0.0-1017-azure), user `azureuser`, SSH key = the user's PC `~/.ssh/id_ed25519` (ed25519, comment `smarthealth-server`). Public IP 20.78.16.155 (Static), DNS label `smarthealth-hub`.
- **Server prep done**: apt upgrade, rebooted, Docker 29.10.0 + Compose v5.8.0, user in `docker` group, 2 GiB `/swapfile` (in `/etc/fstab`). Memory 3.8 GiB total. Disk 28 GB (~16% used before images).
- **NSG inbound rules**: SSH 22 (from VM creation) + custom rule `Allow-HTTP-HTTPS` TCP 80,443 priority 310 (added after the cert failure). UFW deliberately NOT enabled.
- **Code on server**: `/opt/smarthealth-hub` (public repo cloned over HTTPS), branch `main` at `6595469` (merge of PR #17).
- **`.env.server`** on server (`chmod 600`, 31 lines): domains + freshly generated `POSTGRES_PASSWORD` (hex 24), `ENCRYPTION_KEY` (`openssl rand -base64 32`), `QR_HMAC_SECRET` (hex 32), `JWT_SECRET_KEY` (hex 32), plus 14 lines copied from dev `backend/.env` (email/Gmail SMTP, TextBee SMS, OpenAI, Unsplash). The temp copy on the PC was deleted.
- **Verified `.env.server` address lines** (non-secret):
  `API_DOMAIN=smarthealth-hub.japaneast.cloudapp.azure.com`, `NFC_VIEW_BASE_URL=https://smarthealth-hub.japaneast.cloudapp.azure.com`, `QR_BASE_URL`/`WEBAUTHN_ORIGIN=https://smarthealth-hub-two.vercel.app`, `WEBAUTHN_RP_ID=smarthealth-hub-two.vercel.app`, `CORS_ORIGINS=["https://smarthealth-hub-two.vercel.app"]`, `SMS_PROVIDER=textbee`.
- **`dc` alias** in server `~/.bashrc`: `docker compose -f /opt/smarthealth-hub/docker-compose.server.yml --env-file /opt/smarthealth-hub/.env.server`.
- **Stack status** (`dc ps`): backend (healthy), worker Up, beat Up, caddy Up, db postgres:18-alpine (healthy), redis:7-alpine (healthy). Volumes `smarthealth_{pgdata,redisdata,media,caddy_data,caddy_config}`.
- **Demo data seeded** on server: `dc exec backend python scripts/seed_db.py`: 60 patients, ~80 visits, 40 appointments, ~120 immunizations, medical history, **10 health cards** (first 10 patients, card numbers like `HC-2026-XXXXXXXX`), 3 staff accounts. Unsplash photos downloaded into the media volume.
- **Login verified by user**: admin login + Gmail OTP worked, dashboard shows data. **Not confirmed**: whether the user changed the admin password afterwards (it is public in `backend/scripts/seed_db.py`).
- **CI**: all jobs green on PR #16 and PR #17 (first time ever fully green). Coverage gate lowered 70 → 50 (actual 52.21%).
- **Vercel settings**: Root Directory `frontend/web`, preset Next.js, Install Command override `npx pnpm@9.14.4 install --frozen-lockfile`, Build Command override `npx pnpm@9.14.4 run build`, env `SERVER_SIDE_API_URL=https://smarthealth-hub.japaneast.cloudapp.azure.com` and `NEXT_PUBLIC_API_BASE_URL=/api/v1` (Production and Preview).
- **GitHub**: PR #16 (`deploy/vercel-docker-prod`) merged → `724e61f`; PR #17 (`fix/fresh-db-migration`) merged → `6595469`.
- **Local PC repo state** (at handoff): on branch `fix/fresh-db-migration` (local `b0b9e69`, already merged upstream), local `main` behind origin. Untracked: `DEV-WORKFLOW.md` (new), `START.md`, `dump.rdb`, `start-tunnel.ps1`, this handoff. Modified (never commit): `backend/celerybeat-schedule-shm/-wal`.
- **Azure CLI**: NOT installed on the PC (install via winget was blocked by Claude Code's safety classifier; the user created everything in the portal instead).
- **Deploy GitHub workflow**: the user was told to disable it in GitHub Actions UI before merging. **Unknown** whether they did. If not, it fails harmlessly on each merge to `main` (no SSH/secret config).

## What We Tried (Chronological)

1. **Onboarding (read-only)**: found the parent's commit present, branch unpushed, no `bd`, Docker Desktop down, `gh` CLI not installed. Discovered `ci.yml:21` runs `ruff format --check backend/app` (the parent wrongly said CI only runs `ruff check`). `ruff format --check` → 4 files would reformat. Discovered the CI Postgres DB `smarthealth_test` ≠ conftest's hardcoded `smarthealthhub_test`. Discovered `deploy.yml` validation doesn't pass `QR_HMAC_SECRET`, while `config.py:296-299` raises in production on the default value.
2. **CI fix round 1** (commit `c135671`): `ruff format` on `health_cards.py`, `security.py`, `audit_tasks.py`, `reminder_scheduler.py` (whitespace only); CI `POSTGRES_DB`/healthcheck/`DATABASE_URL` → `smarthealthhub_test` (the `/health/db` test uses the app's own `AsyncSessionLocal`, so app DB and test DB must be the same name); `deploy.yml` + `DEPLOY.md` add `QR_HMAC_SECRET`. Local: ruff ✓, full `mypy app` ✓ (111 files), `pnpm install --frozen-lockfile` ✓, lint 0 errors / 82 warnings, tsc ✓.
3. **Committing via PowerShell**: a multi-line `git commit -m "...` paste broke (stuck at `>>`, user hit Ctrl+C, nothing committed). **Fix: write the message to a file and use `git commit -F <file>`.** Used for every commit since.
4. **CI run on PR #16 failed again**: mypy 4 errors that only appear with **redis-py 8.1.0** (CI installs latest; the PC has 6.4.0): `get`/`hgetall` typed `bytes | str` even with `decode_responses=True`. pytest: 3 encryption tests failed because the CI `ENCRYPTION_KEY` decoded to **28 bytes** → `encryption.py:102-108` silently falls back to plaintext; coverage **52.21% < 70**.
5. **CI fix round 2** (commit `1a05b3a`): `typing.cast("str | None", ...)` / `cast("dict[str, str]", ...)` at `monitoring_tasks.py:52`, `passkey_service.py:83`, `health_cards.py` ~1813/1823; new CI key `Y2ktdGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcyE=` (= base64 of the 32-char string `ci-test-encryption-key-32-bytes!`, a test value, not a secret); coverage gate → 50 (user chose "Lower to 50% (Recommended)"). Verified mypy in a scratch venv with redis 8.1.0 AND locally with 6.4.0 (no "redundant cast"). **CI green** → PR #16 merged.
6. **Choosing a host**: proposed DigitalOcean Singapore → the user asked for "open source" (meant free) → proposed Oracle Always Free (web search: A1 cut to **2 OCPU / 12 GB** from June 15, 2026) → **the user has no card**, and the GitHub student credit had lapsed → proposed Azure for Students ($100/yr, no card, school email) vs own PC + Tailscale Funnel → the user has a school email → **Azure for Students**.
7. **Azure VM creation (portal; several failures)**:
   - Default size `Standard_D2s_v3` → "NotAvailableForSubscription" in southeastasia ($91.25/mo anyway).
   - B1ms in southeastasia → "Size not available" ($19.27/mo).
   - The southeastasia "Other sizes" list only showed GPU NC-series ($537–$13,943/mo). Told the user never to pick those.
   - Switched to **East Asia**: the size list looked fine (B-series v2), but **deployment failed with `RequestDisallowedByAzure`** ("policy maintains a set of best available regions").
   - User read Policy → Assignments → allowed locations: `["indonesiacentral","centralindia","malaysiawest","japaneast","australiaeast"]` → chose **japaneast** (mature region, close to PH).
   - Picked **B2als_v2** ($38.40/mo shown in the SEA list, ~$39 in Japan East) over B2ats_v2 ($9.56, 1 GiB, too small).
   - SSH key: the portal defaulted to "Generate new key pair" (RSA) → switched to "Use existing public key" and pasted the PC's ed25519 public key.
   - User clicked "Template deployment" by mistake once (redirected to "Virtual machine").
8. **Attempted Azure CLI automation**: `winget install Microsoft.AzureCLI` was **denied by the Claude Code auto-mode classifier** ("Undermining Oversight"). I did not work around it; I gave the user both a portal path and copy-paste `az` commands. The user finished in the portal.
9. **Server prep**: apt upgrade (`NEEDRESTART_MODE=a DEBIAN_FRONTEND=noninteractive`), get.docker.com, usermod docker group, re-login, swap, reboot (it said "System restart required"). The user was confused about why Docker had to be installed again ("I have docker install"). Explained PC vs server with a diagram. The user also pasted a prompt string as a command (`azureuser@...:~$: command not found`, harmless).
10. **Clone**: the repo is **public** → plain HTTPS clone, no deploy key needed. Ran a secret scan on tracked files: no real secrets are committed (only `.example` env files). Values from `backend/.env` found in tracked files were non-secret (EMAIL_FROM_NAME, EMAIL_HOST_USER, ENVIRONMENT, WEBAUTHN_RP_NAME, TEST_NFC_UID). Demo passwords ARE in `seed_db.py` (public).
11. **Vercel import**: Vercel detected a multi-service repo (FastAPI `backend` + Next `frontend/web`) and offered "Services" / a `vercel.json` prompt → told the user to use **"Import single project" on the `frontend/web` row** instead. First deploy failed: `ERR_PNPM_META_FETCH_FAIL ... Value of "this" must be of type URLSearchParams` / `ERR_INVALID_THIS` (Vercel used an ancient pnpm because `packageManager` + `pnpm-lock.yaml` live at the repo root, not in `frontend/web`). Also the default Build Command was `turbo run build`. **Fix: Install/Build Command overrides with `npx pnpm@9.14.4`** → build succeeded.
12. **`.env.server` creation**: I extracted 14 needed keys from dev `backend/.env` into a scratchpad file (CRLF stripped, checked: no `$` characters, which compose would interpolate) → the user `scp`'d it → a heredoc block on the server built `.env.server`. **The first attempt broke**: the block started with `read -p`, and pasting a multi-line block made `read` swallow the next pasted line, jumbling everything. The partial run also executed `rm .env.secrets`. Fix: set `WEB=smarthealth-hub-two.vercel.app` on its own line first, then paste the block without `read`; re-`scp`'d the file.
13. **First `dc up -d --build`**: the image built in 184 s; backend **crash-looped**: `psycopg2.errors.DuplicateTable: relation "medical_history" already exists` at `0003_medical_history.py:47`. `0001_initial_schema` already creates `medical_history` (same severity CHECK + `idx_medhist_patient`). The user's uncommitted local edit to 0003 (an early return if the table exists) was exactly the fix. An AST scan of all `upgrade()` functions vs 0001 found **no other** duplicate tables/columns/indexes. `alembic/env.py` runs all migrations in **one transaction** → the failed run rolled back fully → no DB wipe needed.
14. **Fix deployed via branch** (`fix/fresh-db-migration`, commit `b0b9e69`): server `git checkout` of the branch + `dc up -d --build` (79 s, cached) → all 6 services up, backend healthy. The user then ran `git checkout main && git pull` on the server BEFORE merging (warned not to rebuild until merged). Later merged PR #17 → server `git pull` → `6595469`.
15. **HTTPS failed**: `curl` printed nothing / timed out. Caddy logs: `tls-alpn-01` and `http-01` challenges → "Timeout during connect (likely firewall problem)", Caddy falling back to the LE staging CA with exponential retry (120 s → 300 s → 600 s). Cause: the NSG only allowed 22 (the 80/443 checkboxes were lost when the form was redone). The user added inbound TCP 80,443 → `dc restart caddy` → `/health` OK over HTTPS. (The user first tried `curl.exe` on the Linux server: "command not found". `curl.exe` is for Windows only.)
16. **Seed + login**: seeded, logged in with OTP via Gmail, dashboard OK.
17. **DEV-WORKFLOW.md** written at the user's request ("documentation markdown file you and i can follow").

## Key Decisions

- **Azure for Students, Japan East, B2als_v2**: no card rules out Oracle/DO/standard Azure free. The subscription policy restricts regions to 5. southeastasia had no affordable sizes, eastasia was blocked. Rejected: B2ats_v2 1 GiB (OOM risk during build/run), Tailscale Funnel on the PC (PC must be on 24/7), Cloudflare quick tunnel (URL changes → breaks NFC chips).
- **Azure DNS label instead of sslip.io**: `smarthealth-hub.japaneast.cloudapp.azure.com` survives an IP change, and the IP is Static too. NFC chips store this hostname, so it must never change.
- **Fresh demo data + NEW secrets** (the user chose fresh data): no dev data to stay compatible with, so `ENCRYPTION_KEY`/`QR_HMAC_SECRET` were generated on the server. Consequence: the server secrets are now the only copy (backing them up is Phase 8).
- **No UFW on the server**: the Azure NSG is the firewall, only Caddy publishes ports, and a UFW mistake could lock the user out of SSH. (DEPLOY.md's ufw steps were skipped.)
- **Secrets transfer by file (`scp`)**, never pasted into chat or typed. Temp files deleted afterwards.
- **Vercel: single project on `frontend/web`**, rejecting Vercel "Services" (the backend needs Celery + shared media disk + WeasyPrint/Tesseract).
- **Coverage gate 70 → 50** (user choice), with a comment in `ci.yml` to ratchet up.
- **`typing.cast` instead of pinning `redis<7`**: type-only, works on 6.4 and 8.1, no runtime change.
- **Manual backend deploys for now** (`git pull && dc up -d --build`). Automating `deploy.yml` was deferred: it would need a dedicated deploy key, 4 SSH secrets, and dropping/replacing its "validate secrets" step, which otherwise wants copies of all server secrets in GitHub.
- **NFC for the cloud = NFC Tools URL records only**: no relay (`nfc_relay_server.py`), no UID reader app. The phone's browser opens the signed link directly against the API domain; `/nfc-monitor` still sees taps because the view endpoint calls `_record_last_scan`.

## Evidence & Data

### Commit log (this session)
| Hash | Branch | Summary |
|---|---|---|
| `c135671` | deploy/vercel-docker-prod | fix(ci): ruff format, align CI test DB name, pass QR_HMAC_SECRET to deploy validation (7 files, +17/−9) |
| `1a05b3a` | deploy/vercel-docker-prod | fix(ci): redis typing casts, valid 32-byte test encryption key, coverage gate 50% |
| `724e61f` | main | Merge PR #16 (deploy/vercel-docker-prod) |
| `b0b9e69` | fix/fresh-db-migration | fix(migrations): skip 0003 when medical_history already exists |
| `6595469` | main | Merge PR #17 (fix/fresh-db-migration); server is on this |

### CI failure → fix matrix
| CI job | Failure | Root cause | Fix |
|---|---|---|---|
| Lint Backend | `ruff format --check` 4 files | pre-existing formatting | `ruff format` (whitespace) |
| Test Backend | (would fail) DB name | CI DB `smarthealth_test` vs conftest `smarthealthhub_test` | rename in ci.yml |
| Type Check Backend | 4 mypy `[assignment]` errors | redis-py 8.1 types `bytes \| str` | `typing.cast` ×4 |
| Test Backend | 3 encryption tests | CI key decodes to 28 bytes → plaintext fallback | valid 32-byte key |
| Test Backend | coverage 52.21% < 70 | gate never reached before | `--cov-fail-under=50` |
| Deploy (validate) | would always fail | missing `QR_HMAC_SECRET` env | added to deploy.yml |

CI pytest numbers (run before fix round 2): 3 failed, 264 passed (267 total), coverage TOTAL 7625 stmts / 3644 miss = 52.21%. Lowest-coverage modules: `ocr_service.py` 0% (344 stmts), `pdf_renderer.py` 0%, `ai_service.py` 0%, `report_tasks.py` 0%, `risk_scoring_service.py` 0%, `health_cards.py` endpoints 37%.

### Azure region/size attempts
| Region | Size | Result | $/month |
|---|---|---|---|
| southeastasia | Standard_D2s_v3 (default) | NotAvailableForSubscription | 91.25 |
| southeastasia | B1ms | Size not available | 19.27 |
| southeastasia | "Other sizes" | only GPU NC-series | 537.28 – 13,943 |
| eastasia | B-series v2 listed | **RequestDisallowedByAzure** at deploy | n/a |
| **japaneast** | **B2als_v2** | ✅ deployed | ~39 |

B-series v2 prices seen (SEA list): B2ats_v2 2vCPU/1GiB $9.56 · B2ts_v2 1GiB $10.66 · **B2als_v2 4GiB $38.40** · B2ls_v2 4GiB $42.63 · B2as_v2 8GiB $76.65 · B2s_v2 8GiB $85.41 · B4als_v2 8GiB $135.78.
Credit math told to user: ~$45/mo all-in (VM + Standard SSD + static IP) → ~2 months 24/7, 4+ months if stopped at night. Auto-shutdown (Management tab) was offered as optional; not known if enabled.

### Server verification outputs
| Check | Output |
|---|---|
| `docker version` / `docker compose version` | Docker 29.10.0 / Compose v5.8.0 |
| `free -h` | Mem 3.8Gi total, 3.2Gi available; Swap 2.0Gi |
| first build | `smarthealth-backend:latest Built 184.5s` |
| rebuild after 0003 fix | `Built 79.6s` (only COPY alembic+ layers rebuilt; final chown layer ~62 s) |
| `/health` over HTTPS | `{"status":"ok","service":"smarthealth-hub-api","version":"0.1.0"}` |
| Caddy before NSG fix | tls-alpn-01 + http-01 "Timeout during connect (likely firewall problem)", attempt 6, retrying_in 600 |

### Vercel build (success) key lines
```
Running "install" command: `npx pnpm@9.14.4 install --frozen-lockfile`...
Scope: all 4 workspace projects ... resolved 580 ... done (17.1s)
Running "npx pnpm@9.14.4 run build"  →  > web@0.1.0 build /vercel/path0/frontend/web  > next build
▲ Next.js 16.2.10 (Turbopack) · Experiments: proxyTimeout: 45000
✓ Compiled successfully in 15.3s · Finished TypeScript in 14.4s · 33/33 static pages
Build Completed in /vercel/output [55s]   (build region iad1, Washington D.C.)
```

### dev `backend/.env` keys copied to server (values never shown)
`SMS_PROVIDER(=textbee) TEXTBEE_API_KEY TEXTBEE_DEVICE_ID TEXTBEE_BASE_URL SMS_REMINDER_LEAD_HOURS SMS_MAX_RETRIES EMAIL_HOST(=smtp.gmail.com) EMAIL_PORT(=587) EMAIL_USE_TLS(=true) EMAIL_FROM_NAME EMAIL_HOST_USER EMAIL_HOST_PASSWORD UNSPLASH_ACCESS_KEY OPENAI_API_KEY`
NOT copied: `ADMIN_ALERT_PHONE` (empty in dev), `TEST_NFC_UID`, `QR_BASE_URL`, `WEBAUTHN_*`, `CORS_ORIGINS` (regenerated for prod).

### Timeline (user prompt → outcome)
| # | User said | Outcome |
|---|---|---|
| 1 | read handoff, onboard, wait | read-only checks; found 3 CI problems |
| 2 | "go ahead with the CI fixes, leave the migration file" | round-1 fixes |
| 3 | "give me the commit command" / push / PR description | commit `c135671`, PR #16 opened |
| 4 | pasted CI logs (pytest + mypy) | round-2 fixes, coverage → 50 (AskUserQuestion) |
| 5 | "all checks passed, what's next? … Merge?" | merge guidance, disable Deploy workflow advice |
| 6 | DigitalOcean / "open source?" / "no card, student credit closed" | Oracle → Azure for Students |
| 7 | "tell me first what is the purpose" | big-picture explanation + diagram |
| 8 | Azure portal screenshots (sizes, regions, SSH key, policy) | VM in japaneast |
| 9 | "fetch this and do it for me?" (portal URL) | winget blocked by classifier; portal path |
| 10 | Docker/swap/reboot | Phase 2 done |
| 11 | public repo, Vercel import screenshots, pnpm error | Vercel overrides → success |
| 12 | `.env.server` paste jumbled | redo with `WEB=` line |
| 13 | backend crash log | PR #17 0003 fix |
| 14 | Caddy firewall logs | NSG 80/443 → HTTPS OK |
| 15 | "Login worked … how to keep Vercel/Azure up to date?" | workflow explained |
| 16 | "create me a documentation markdown file" | `DEV-WORKFLOW.md` |
| 17 | "/handoff … start on the NFC cards Phase 7" | this file |

### Hosting options evaluated (in order)
| Option | Cost | Outcome |
|---|---|---|
| DigitalOcean Singapore, Basic 2 GB | ~US$12/mo | rejected: needs card; GitHub Student Pack credit lapsed |
| Oracle Cloud Always Free (Ampere A1) | free | rejected: card required for verification. Also, per web search, the free A1 allowance was cut from 4 OCPU/24 GB to **2 OCPU/12 GB** on 2026-06-15; capacity errors are common |
| Own PC + Cloudflare quick tunnel | free | rejected: URL changes every restart → breaks NFC chips + Vercel env |
| Own PC + Tailscale Funnel (`*.ts.net`) | free | fallback only: stable HTTPS URL, but the PC must stay on |
| **Azure for Students** | $100/yr credit, **no card**, school email | ✅ chosen (school account works) |

### Azure VM create-form values used (portal)
| Field | Value |
|---|---|
| Subscription | Azure for Students |
| Resource group | `smarthealth-rg` |
| VM name | `smarthealth-server` |
| Region | (Asia Pacific) Japan East |
| Availability | No infrastructure redundancy required (zone 1 hid some sizes) |
| Security type | Trusted launch (default) |
| Image | Ubuntu Server 24.04 LTS - x64 Gen2 |
| Size | Standard_B2als_v2 |
| Auth | SSH public key, user `azureuser`, "Use existing public key" (PC's ed25519) |
| Inbound ports | SSH only took effect; 80/443 added later as an NSG rule |
| OS disk | Standard SSD, 30 GiB default |
| DNS label (after create) | `smarthealth-hub` → `smarthealth-hub.japaneast.cloudapp.azure.com`, IP assignment Static |

### Exact server command log (all run as `azureuser`, worked)
```bash
sudo apt update && sudo NEEDRESTART_MODE=a DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker azureuser            # then exit + ssh back in
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo reboot
sudo mkdir -p /opt/smarthealth-hub && sudo chown azureuser:azureuser /opt/smarthealth-hub
git clone https://github.com/crud-j/smarthealth-hub.git /opt/smarthealth-hub
# PC: scp <scratchpad>/server-secrets.env azureuser@<host>:/opt/smarthealth-hub/.env.secrets
WEB=smarthealth-hub-two.vercel.app           # its own line; never `read -p` inside a pasted block
# then the heredoc block → .env.server (31 lines), chmod 600, rm .env.secrets
echo "alias dc='docker compose -f /opt/smarthealth-hub/docker-compose.server.yml --env-file /opt/smarthealth-hub/.env.server'" >> ~/.bashrc && source ~/.bashrc
dc up -d --build                              # crash: 0003 DuplicateTable
git fetch origin && git checkout fix/fresh-db-migration && dc up -d --build   # healthy
git checkout main && git pull                 # after PR #17 merge → 6595469
dc restart caddy                              # after NSG 80/443 rule → cert issued
dc exec backend python scripts/seed_db.py
```

### Consolidated failed approaches (don't repeat)
| Attempt | Error | Lesson |
|---|---|---|
| Multi-line `git commit -m "…"` pasted into PowerShell | stuck at `>>`, nothing committed | use `git commit -F <file>` |
| Azure default size D2s_v3 / B1ms in southeastasia | NotAvailableForSubscription / Size not available | student sub only has GPU sizes there |
| Region eastasia | RequestDisallowedByAzure (policy) | read Policy → Assignments → allowed locations first |
| `winget install Microsoft.AzureCLI` by Claude | denied by auto-mode classifier | user does Azure in the portal (or installs CLI themselves) |
| Vercel default import ("Services", multi-service) | n/a | import single project on `frontend/web` |
| Vercel default install | `ERR_PNPM_META_FETCH_FAIL` / `ERR_INVALID_THIS` | override install/build with `npx pnpm@9.14.4` |
| Pasted block starting with `read -p` | prompt swallowed the next pasted line; partial run deleted `.env.secrets` | set variables on their own line first |
| First `dc up` on empty DB | 0003 `DuplicateTable medical_history` | 0003 guard (PR #17) |
| HTTPS before the NSG rule | LE "Timeout during connect (likely firewall problem)" | open TCP 80,443 in NSG, `dc restart caddy` |
| `curl.exe` on the Linux server | command not found | `curl` on Linux, `curl.exe` on Windows |
| `rm` inside container via `sh -c` (parent session) | blocked by safety check | use `test -w` |

### AskUserQuestion this session
- "Backend test coverage in CI is 52.2%, but ci.yml requires 70% … How should I handle it?" Options: **Lower to 50% (Recommended)** ✅ / Keep 70%, write tests / Remove the minimum.

### Secret-scan of the public repo (2026-11-18)
- Tracked env files: only `.env.docker.example`, `.env.server.example`, `backend/.env.example`, `frontend/web/.env.local.example`.
- Dev `backend/.env` values found in tracked files: only non-secret ones (EMAIL_FROM_NAME, EMAIL_HOST_USER, ENVIRONMENT, WEBAUTHN_RP_NAME, TEST_NFC_UID). No JWT/encryption/QR/SMTP-password/TextBee/OpenAI values.
- Hardcoded demo credentials in `backend/scripts/seed_db.py:77-82` (admin uses a real Gmail inbox the user owns; BHW/physician `@bhc.local`). Dev compose default `POSTGRES_PASSWORD` (`docker-compose.yml`, `infra/docker-compose.yml`) is dev-only; the server compose requires its own.

## Code Analysis (what Phase 7 touches)

- **Signed link format**: `{NFC_VIEW_BASE_URL}/view/{quote(card_number)}?sig={32 hex}`, built by `build_nfc_view_url()` (`backend/app/services/nfc_payload_service.py:90`). `sign_nfc_identifier()` (`:65`) = HMAC-SHA256(`QR_HMAC_SECRET`, `"nfc-view:" + card_number`)[:32 hex]. `verify_nfc_signature()` (`:77`) is constant-time and lowercases/strips the sig.
- **Production link example shape**: `https://smarthealth-hub.japaneast.cloudapp.azure.com/view/HC-2026-1A2B3C4D?sig=<32 hex>`. Seeded cards use `HC-{year}-{8 hex}` (`seed_db.py:517`); cards generated in-app use `BHC-{year}-{6 digits}`. Length after NDEF's `https://` prefix compression ≈ 44 (host) + 22 (path) + 5 + 32 ≈ **103 bytes**. That fits NTAG213 (144 bytes user memory) but is tighter than the parent's sslip.io estimate (~85). NTAG215/216 are roomier.
- **Signatures are required in production**: `Settings.nfc_signed_links_required` (`config.py:75`), `NFC_REQUIRE_SIGNED_LINKS=None` → `ENVIRONMENT=="production"`. Compose sets `ENVIRONMENT: production`. The check runs **before** the DB lookup (`health_cards.py:1044`). Invalid → 403 HTML "This card link is not valid. Ask the health center to rewrite this card."
- **Public view endpoints**: root `GET /view/{identifier}` (`backend/app/main.py:456`, `nfc_tap_view`, takes `sig`) and `GET /api/v1/health-cards/view/{identifier}` (`health_cards.py:995`). Rate limit `_NFC_VIEW_RATE_LIMIT = 20`/60 s/IP (`:906`, in-memory per uvicorn worker, and the server runs `API_WORKERS=2`, so the effective limit is up to ~40). Lookup: `card_number` exact, then `upper(nfc_uid)`. Writes a `HEALTH_CARD_VIEW` audit row and `_record_last_scan` (Redis `nfc:last_scan`, TTL 24 h).
- **Where staff get the link**: card print page `frontend/web/app/(dashboard)/health-cards/[patientId]/print/page.tsx`: `NfcUrlHint({url})` at `:43`, rendered at `:451` and `:550` with `card.nfc_view_url` (backend-computed `HealthCardResponse.nfc_view_url`, a `@computed_field` in `backend/app/schemas/health_card.py`). It has a copy-to-clipboard button.
- **Bulk export**: `GET /api/v1/health-cards/nfc-batch` (`health_cards.py:1872`, admin/admin_staff, 1–500 items, default 50, optional `barangay`, audit `NFC_BATCH_EXPORT`) returns signed URLs per card. The parent fixed it to use `build_nfc_view_url`.
- **Monitor**: frontend `/nfc-monitor` (staff login required) polls `GET /api/v1/health-cards/last-scan` (`health_cards.py:968`, `_BHW_PLUS`) every 2000 ms. `_record_last_scan` is at `:108`, `_read_last_scan` at `:125`.
- **UID path (not used in the cloud plan)**: `POST /api/v1/health-cards/scan-uid` (`:934`, 60/min/IP); binding via `/{patient_id}/nfc-link` (`:2238`) and `/{patient_id}/link-nfc-uid` (`:2682`); `link_nfc_uid()` (`nfc_payload_service.py:104`).
- **In-app Web NFC**: `frontend/web/lib/nfc.ts` (`checkNfcSupport`, `readNfcTag` reads an NDEF **Text** record JSON `{patient_id, card_version}`). `frontend/web/components/cards/NfcScanButton.tsx`, used by `health-cards/verify/page.tsx`. Works only in **Chrome on Android** over HTTPS (Samsung Internet does NOT support Web NFC). NOTE: chips written by NFC Tools with a **URL** record are a different format from the app's Text-record JSON; the in-app scan button expects the Text record. Check how `readNfcTag` handles a URL record before promising in-app scanning of URL chips.

## Files Changed

### Source code (committed)
- `backend/app/api/v1/endpoints/health_cards.py`: ruff format (~2313); `from typing import Any, cast`; `meta = cast("dict[str, str]", redis_client.hgetall(meta_key))`, `raw_results = cast(...)` in batch status (~1813/1823).
- `backend/app/core/security.py`, `backend/app/workers/audit_tasks.py`, `backend/app/workers/reminder_scheduler.py`: ruff format only.
- `backend/app/workers/monitoring_tasks.py`: `from typing import cast`; `raw = cast("str | None", r.get(_FAILURE_COUNT_KEY))`.
- `backend/app/services/passkey_service.py`: `from typing import Any, cast`; `value = cast("str | None", await r.get(key))`.
- `backend/alembic/versions/0003_medical_history.py`: `from sqlalchemy import inspect as sa_inspect`; early `return` in `upgrade()` if `"medical_history" in sa_inspect(bind).get_table_names()` (the user's own edit, committed in PR #17).

### Config / CI (committed)
- `.github/workflows/ci.yml`: Postgres `POSTGRES_DB: smarthealthhub_test` + healthcheck + `DATABASE_URL`; `ENCRYPTION_KEY: Y2ktdGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcyE=` (test value) with comment; `--cov-fail-under=50` with comment.
- `.github/workflows/deploy.yml`: `QR_HMAC_SECRET: ${{ secrets.QR_HMAC_SECRET }}` in the validate step.
- `DEPLOY.md`: `QR_HMAC_SECRET` added to the required GitHub secrets list.

### Docs (NOT committed yet)
- `DEV-WORKFLOW.md` (new, repo root, ~300 lines): §1 production at a glance, §2 checklist, §3 git, §4 local dev, §5 checks (incl. throwaway test containers with `DATABASE_URL=.../smarthealthhub_test`), §6 backend deploy, §7 migrations (`alembic revision -m ... --rev-id 0029`), §8 settings/secrets + Vercel overrides, §9 server cheat sheet, §10 troubleshooting + rollback, §11 don'ts, §12 working with Claude.
- This handoff.

### Outside the repo
- Server: `/opt/smarthealth-hub/.env.server`, `~/.bashrc` (dc alias), `/swapfile` + `/etc/fstab`.
- Azure: VM, NSG rule `Allow-HTTP-HTTPS`, DNS label, static IP.
- Vercel: project settings above.
- Claude memory `deployment_setup.md`: server/Vercel facts, decisions, DEV-WORKFLOW pointer, commit `-F` preference.

## User Feedback & Preferences (REQUIRED)

- "go ahead with the CI fixes, leave the migration file": wanted the migration change kept out (later needed; explained before committing it).
- "give me the commit command" / "give me the push command" / "give me the PR description": **the user runs git commit/push/PR themselves**; Claude provides commands and texts.
- Pasted a multi-line `git commit -m` that broke in PowerShell → always give `git commit -F <file>` with the message in a file.
- Coverage: chose **"Lower to 50% (Recommended)"**.
- "then i should click the create pull request?" / "tell me if im going to click the Merge pull request or not": wants explicit click-level guidance on GitHub/Vercel/Azure UIs.
- "can't we use another open source?" (meant free hosting) → "I do not have a card, and the student credit on the github closed."
- "tell me first what is the purpose of what we doing": wants the **big picture before steps**; responded well to a diagram + status table.
- "yes i have school email address. Give me now the process".
- "is it possible for you to fetch this and do it for me?": would like Claude to do more directly (blocked for winget; the portal is the user's browser session).
- "I have docker install why i have to install it on Block 2?": a beginner with the PC-vs-server distinction. Always label where a command runs (`PS C:\...>` vs `azureuser@smarthealth-server:~$`).
- "where do i run this?": same; prefers numbered steps with the expected prompt shown.
- Screenshots of each portal page with "what's next?": the user works step-by-step with screenshots; respond to exactly what's on screen.
- "it should be WEB=https://smarthealth-hub-two.vercel.app ??": careful about exact values; clarify formats explicitly.
- "If i want to start development again … what should i run to make the vercel and on the azure up to date?" → led to DEV-WORKFLOW.md.
- "create me a documentation markdown file you and i can follow" → it should serve both the user and future Claude sessions.
- "/handoff … i want to start on the NFC cards Phase 7".
- Cautious and explanation-hungry (carried over from the parent): explain each command before running; check prerequisites.
- User email/identity must stay private (never in external requests or in this public repo).

## Where We're Going

1. **Housekeeping (5 min, local PC)**:
   a. `git checkout main && git pull` (local main is behind; local branch `fix/fresh-db-migration` is merged and can be deleted: `git branch -d fix/fresh-db-migration`).
   b. `DEV-WORKFLOW.md` + this handoff were committed at session close on branch **`docs/dev-workflow`** (commit `session: azure-go-live …`) and pushed by the user. **Check the PR `docs/dev-workflow → main` is merged.** If not, open/merge it (CI should pass, docs only). No server update needed for docs.
   c. Ask the user: did they **change the admin password** (Settings → Profile)? Did they **disable the Deploy workflow**? Did they enable Azure **auto-shutdown**?
2. **Phase 7: NFC cards (the main task)**:
   a. Ask which chips they have (NTAG213/215/216? stickers/cards?) and how many. Confirm NFC is on (S21: Settings → Connections → NFC and contactless payments).
   b. In the live app (Chrome on S21 or PC): Health Cards → a seeded patient with a card (first 10 seeded patients) → **Print** page → copy the signed link from `NfcUrlHint`. If the page shows no link, check the API response's `nfc_view_url` (`GET /api/v1/health-cards/{patient_id}`).
   c. NFC Tools app: **Write → Add a record → URL/URI** → paste the full `https://…` link (the app may split the scheme prefix; make sure `https://` is selected) → **Write** → hold the chip to the phone's back (S21 antenna is mid-back).
   d. Test: lock/unlock the phone, tap the chip → the browser opens `https://smarthealth-hub.japaneast.cloudapp.azure.com/view/…?sig=…` → the patient summary HTML. Also test a **tampered link** (change one sig char) → expect 403 "This card link is not valid".
   e. Open `/nfc-monitor` on the PC (logged in) and tap again → the last scan appears within ~2 s.
   f. Optional: lock the chip in NFC Tools (**irreversible**) only after the link is final. Never lock test chips.
   g. Optional: in-app "Scan NFC" (Chrome Android only). Check whether `readNfcTag` accepts URL records; if not, decide whether to extend it (code change → PR flow per DEV-WORKFLOW.md).
3. **Phase 8: backups**: daily `pg_dump` cron on the server (DEPLOY.md §8: `/etc/cron.daily/smarthealth-backup`, 14-day retention, pg_dump + media tar), plus copy `ENCRYPTION_KEY` and `QR_HMAC_SECRET` to the user's password manager (they exist ONLY on the server now). Consider off-server copies (scp to PC, or Azure Blob, which costs credit).
4. **Cleanup**: on the PC with Docker Desktop running: `docker compose -p shh-verify down -v` (only `shh-verify_*`), optionally `docker image rm smarthealth-backend:test smarthealth-backend:latest`. Don't touch `agap_*` / `deadapp-*`.
5. **Optional later**: automate backend deploy (dedicated SSH deploy key + GitHub secrets `SSH_HOST/USER/PRIVATE_KEY/PORT`, rework the validate step); update DEPLOY.md with the Azure specifics; raise the coverage gate; legacy `infra/` files decision.

## Risks & Blockers

- **Server secrets exist in one place only** (`.env.server` on the VM). Losing the VM disk = encrypted PHI unreadable + all NFC chips/QR codes invalid. Phase 8 must back them up.
- **Azure credit**: ~$45/month 24/7 → $100 lasts ~2 months. When it runs out the VM stops (no charges, no card). Stopping the VM breaks login and NFC taps until restarted.
- **NTAG213 capacity**: ~103-byte URL is near the 144-byte limit. If NFC Tools reports "not enough space", use NTAG215/216.
- **Rate limit per uvicorn worker** (in-memory): repeated test taps (>20/min/IP per worker) return 429. Wait a minute.
- **Vercel proxy + slow Gmail SMTP** on login (untested at scale); login worked in practice.
- **Deploy workflow** may be red on every merge if not disabled (harmless).

## Open Questions

- What NFC chip type/size does the user have, and how many cards to write (10 seeded cards vs real ones)?
- Does `readNfcTag` (`frontend/web/lib/nfc.ts`) handle NDEF URL records, or only the Text-JSON format? (Matters for the in-app "Scan NFC" button with NFC Tools–written chips.)
- Did the user change the admin password, disable the Deploy workflow, enable auto-shutdown?
- Should the demo BHW/physician accounts (`@bhc.local`, which can't receive OTP) be deactivated or given real emails?
- Legacy infra files (`infra/docker-compose*.yml`, `infra/nginx`, root `docker-compose.yml`, `frontend/web/Dockerfile`): delete or fix? (Unanswered since the parent.)

## Quick Start for Next Session

```bash
# Reference docs (read first)
cat DEV-WORKFLOW.md                 # agreed process + all live addresses (committed on docs/dev-workflow at session close)
cat plans/handoffs/HANDOFF_azure-go-live_2026-11-18.md
cat plans/handoffs/HANDOFF_vercel-docker-deploy_2026-11-17.md   # parent: NFC design, "NFC System Map"

# Key files for Phase 7
backend/app/services/nfc_payload_service.py                       # sign/verify/build_nfc_view_url
backend/app/api/v1/endpoints/health_cards.py                      # view (~995), last-scan (~968), nfc-batch (~1872)
frontend/web/app/(dashboard)/health-cards/[patientId]/print/page.tsx   # NfcUrlHint (:43)
frontend/web/lib/nfc.ts  frontend/web/components/cards/NfcScanButton.tsx

# Verify live state (PC PowerShell)
curl.exe -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health
# Server (user runs): ssh azureuser@smarthealth-hub.japaneast.cloudapp.azure.com ; dc ps

# Next action
# Housekeeping (git checkout main + pull; confirm docs/dev-workflow PR merged; ask the 3 status questions),
# then Phase 7 step 2a: ask the user's chip type, then walk them
# through copying a signed link from the Print page and writing it with NFC Tools on the S21.
```

## Session Closed
**Closed at:** 2026-11-18 (MPST, UTC+8)
**Commit:** the `session: azure-go-live [standalone-9d299342]` commit on branch `docs/dev-workflow` that includes this note (run manually by the user from the command Claude provided)
**Session status:** Handed off to next session
