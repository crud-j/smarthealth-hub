# SmartHealth Hub — Development & Deployment Workflow

How to make changes on your PC and get them live on **Vercel** (frontend) and
**Azure** (backend). Follow it top to bottom for every change.

> First-time server setup is in `DEPLOY.md`. This file is for **day-to-day work
> after the system is live**. Where the two differ, this file describes what
> is actually running (see [Production at a glance](#1-production-at-a-glance)).

---

## 1. Production at a glance

| What | Where |
|---|---|
| Website (Next.js) | **https://smarthealth-hub-two.vercel.app**: Vercel project `smarthealth-hub`, root dir `frontend/web` |
| Backend API (FastAPI) | **https://smarthealth-hub.japaneast.cloudapp.azure.com**: health check at `/health` |
| Server | Azure for Students VM `smarthealth-server`, resource group `smarthealth-rg`, region **Japan East**, size B2als_v2 (2 vCPU / 4 GiB + 2 GiB swap), Ubuntu 24.04 |
| Login to server | `ssh azureuser@smarthealth-hub.japaneast.cloudapp.azure.com` (key: `~/.ssh/id_ed25519`) |
| Code on server | `/opt/smarthealth-hub` (a `git clone` of this repo, branch `main`) |
| Server settings + secrets | `/opt/smarthealth-hub/.env.server` (**not** in git, `chmod 600`) |
| Services on server | `docker-compose.server.yml`: caddy (HTTPS), backend, worker, beat, db (Postgres 18), redis |
| Firewall | Azure Network Security Group: inbound 22, 80, 443 only |
| SMS / Email | TextBee / Gmail SMTP (same accounts as development) |

```
 Browser ──► Vercel (website) ──/api/v1/*, /media/*──► Azure: Caddy ─► FastAPI ─► Postgres / Redis
 Phone tapping NFC card ──────────────────────────────► Azure: Caddy ─► FastAPI  (/view/... signed link)
                                                         Celery worker + beat run beside FastAPI
```

**Who updates what:**

| Part | How it gets updated |
|---|---|
| Frontend | **Automatic.** Vercel rebuilds on every push/merge to `main` |
| Backend | **Manual.** One command on the server after merging (see [§6](#6-deploy-the-backend-azure)) |
| Database schema | **Automatic.** Alembic migrations run when the backend container starts |

---

## 2. The change checklist (the whole loop)

```
[ ] 1. Update local main and create a branch               (§3)
[ ] 2. Make the change and run it locally                  (§4)
[ ] 3. Run the same checks CI runs                         (§5)
[ ] 4. Commit + push the branch                            (§3)
[ ] 5. Open a pull request → wait for CI to be green       (§3)
[ ] 6. Merge the PR → Vercel deploys the frontend by itself
[ ] 7. Update the backend on the server                    (§6)
[ ] 8. Check the live site                                 (§6)
```

---

## 3. Git: branch → pull request → merge

On your **PC** (PowerShell, repo root `C:\Users\githu\OneDrive\Documents\smarthealth-hub`):

```powershell
git checkout main
git pull
git checkout -b feature/short-description      # or fix/..., chore/...
```

…make your changes…

```powershell
git status                                     # see what changed
git add path\to\file1 path\to\file2            # add files by name, not "git add ."
git commit -F commit-msg.txt                   # message from a file (see below)
git push -u origin feature/short-description
```

Then on GitHub: **Compare & pull request** → base `main` → **Create pull request**.
Wait for all CI checks to turn green → **Merge pull request** → **Delete branch**.

**Writing commit messages in PowerShell.** A multi-line `git commit -m "..."`
breaks when pasted into PowerShell (you get stuck at a `>>` prompt). Put the
message in a text file and use `git commit -F <file>`. Format:

```
type(scope): short summary in present tense

Why the change was needed and what it does, wrapped at ~72 characters.
```

`type` is one of `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`.

**Never commit:** `backend/.env`, `.env.server`, `frontend/web/.env.local`,
`dump.rdb`, `backend/celerybeat-schedule*`, `node_modules`, `.next`. The repo
is **public**: anything committed is visible to everyone, forever.

---

## 4. Local development (your PC)

Unchanged from before. The local setup is completely separate from production
(its own database and settings).

| # | Service | Command |
|---|---|---|
| 0 | Redis (WSL, once per session) | `redis-server --port 6380 --daemonize yes` |
| 1 | Backend | `cd backend` → `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` |
| 2 | Celery worker | `cd backend` → `celery -A app.workers.celery_app worker --loglevel=info -P solo` |
| 3 | Celery beat | `cd backend` → `celery -A app.workers.celery_app beat --loglevel=info --schedule=celerybeat-schedule` |
| 4 | Frontend | `cd frontend\web` → `npm run dev` |

- Local URLs: http://localhost:3000 (web), http://localhost:8000/docs (API docs).
- **Install packages with pnpm at the repo root** (`pnpm install`), never
  `npm install`. This is a pnpm workspace and `npm install` breaks it.
- ⚠️ Local beat/worker use the **same TextBee device** as production. Testing
  reminders locally sends **real SMS**.

---

## 5. Checks before pushing (same as CI)

CI runs on every pull request. Running these first saves a round trip.

**Backend** (`cd backend`):
```powershell
python -m ruff check app
python -m ruff format --check app      # fix with: python -m ruff format app
python -m mypy app --ignore-missing-imports
```

**Frontend** (`cd frontend\web`):
```powershell
pnpm run lint                          # must show 0 errors (warnings are OK)
pnpm exec tsc --noEmit
pnpm run test
```

**Backend tests** need a PostgreSQL user that can create the
`smarthealthhub_test` database, plus Redis. Locally the easiest way is two
throwaway Docker containers (Docker Desktop must be running):
```powershell
docker run -d --rm --name shh-test-pg -e POSTGRES_USER=shh_test -e POSTGRES_PASSWORD=shh_test -e POSTGRES_DB=smarthealthhub_test -p 127.0.0.1:5499:5432 postgres:18-alpine
docker run -d --rm --name shh-test-redis -p 127.0.0.1:6399:6379 redis:7-alpine
cd backend
$env:DATABASE_URL="postgresql+asyncpg://shh_test:shh_test@127.0.0.1:5499/smarthealthhub_test"; $env:REDIS_URL="redis://127.0.0.1:6399/0"; python -m pytest -q
docker stop shh-test-pg shh-test-redis
```
Or skip it and let CI run the tests on the pull request.

CI facts: the coverage gate is **50%** (raise it as tests are added). CI uses
the newest `redis-py`, so type errors can appear in CI that don't appear
locally.

---

## 6. Deploy the backend (Azure)

After the PR is merged, from your PC:

```powershell
ssh azureuser@smarthealth-hub.japaneast.cloudapp.azure.com
```

On the **server**:

```bash
cd /opt/smarthealth-hub && git pull && dc up -d --build
```

- `git pull` fetches the merged code.
- `dc up -d --build` rebuilds the backend image and restarts only what changed.
  Usually 1–3 minutes. Migrations run automatically on start.
- `dc` is a shortcut (set up in `~/.bashrc`) for
  `docker compose -f /opt/smarthealth-hub/docker-compose.server.yml --env-file /opt/smarthealth-hub/.env.server`.

**Check it worked:**
```bash
dc ps                                   # 6 services Up, backend (healthy)
curl -s https://smarthealth-hub.japaneast.cloudapp.azure.com/health; echo
```
Then open https://smarthealth-hub-two.vercel.app and try the feature you changed.

**When a change touches both frontend and backend:** run the server update
right after merging. Vercel takes ~2–3 minutes to publish, so the backend is
ready first.

---

## 7. Database changes (migrations)

- **Every schema change = a new migration file.** Never edit a migration that
  has already run on any database (production or yours). The first production
  start crashed for exactly this reason: `0003` and `0001` both created
  `medical_history`.
- Migrations are hand-numbered. Use the next number after the highest one
  in `backend/alembic/versions/` (it was `0028` in Nov 2026, so the next is `0029`):
  ```powershell
  cd backend
  python -m alembic revision -m "short description" --rev-id 0029
  ```
  Then fill in `upgrade()` and `downgrade()` in the new
  `alembic/versions/0029_short_description.py`. Check that `down_revision` is
  the previous head (`python -m alembic heads` should show exactly one head).
- Apply locally: `python -m alembic upgrade head`.
- Must work on an **empty** database too (the server was built from empty).
  The backend-test containers in §5 are an easy way to check:
  `alembic upgrade head` against them.
- Encrypted columns (`medical_history.notes`, `visits.diagnosis`,
  `visits.treatment_notes`) stay `TEXT`. Encryption happens in Python, never
  in SQL.

---

## 8. Settings and secrets

| Change | Where | Then |
|---|---|---|
| Backend setting (email, SMS, CORS, URLs…) | Server: `nano /opt/smarthealth-hub/.env.server` | `dc up -d` (recreates containers with new values) |
| Frontend env var | Vercel → Project → Settings → Environment Variables | Deployments → ⋯ → **Redeploy** (values are baked in at build time) |
| New setting in code | Add to `backend/app/core/config.py` **and** `.env.server.example` (placeholder value only) | Add the real value on the server |

**Getting a secret onto the server without pasting it anywhere:** put it in a
file on your PC and copy it with `scp`, then delete the local file:
```powershell
scp C:\path\to\file azureuser@smarthealth-hub.japaneast.cloudapp.azure.com:/opt/smarthealth-hub/
```

**Never change on the server** (unless you know the consequences):
- `ENCRYPTION_KEY`: all encrypted notes/diagnoses become unreadable.
- `QR_HMAC_SECRET`: every printed QR code and written NFC chip stops working.
- `POSTGRES_PASSWORD`: the database volume keeps the old password; changing
  only the file breaks the backend's connection.

Keep a copy of `ENCRYPTION_KEY` and `QR_HMAC_SECRET` in a password manager.

**Vercel build settings** (already set; listed so they're not "fixed" by accident):
- Root Directory `frontend/web`, Framework Next.js
- Install Command `npx pnpm@9.14.4 install --frozen-lockfile`
- Build Command `npx pnpm@9.14.4 run build`
- Env: `SERVER_SIDE_API_URL=https://smarthealth-hub.japaneast.cloudapp.azure.com`, `NEXT_PUBLIC_API_BASE_URL=/api/v1`

Without the two command overrides, Vercel picks an ancient pnpm
(`ERR_INVALID_THIS`) and tries `turbo run build`.

---

## 9. Server cheat sheet

All on the server, in `/opt/smarthealth-hub`:

| Task | Command |
|---|---|
| Status of all services | `dc ps` |
| Live logs of one service (Ctrl+C to stop) | `dc logs -f backend` (or `worker`, `beat`, `caddy`, `db`) |
| Last 50 log lines | `dc logs --tail 50 backend` |
| Restart one service | `dc restart backend` |
| Python shell / script in the backend | `dc exec backend python scripts/<script>.py` |
| Database shell | `dc exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'` |
| Current migration | `dc exec backend alembic current` |
| Disk / memory | `df -h /` · `free -h` · `docker system df` |
| Free disk from old images | `docker image prune -f` |

**Saving Azure credit ($100/year, about $45/month at 24/7):** Azure portal →
Virtual machines → `smarthealth-server` → **Stop** when nobody needs it, and
**Start** before use (~1 minute). The DNS name, data and settings survive a
stop. The website on Vercel stays up, but logins fail while the server is stopped.

---

## 10. Troubleshooting

| Symptom | Look at | Usual cause / fix |
|---|---|---|
| `dc up` says backend **unhealthy**, worker/beat "not started" | `dc logs --tail 60 backend` | Migration error or crash at startup. Read the last `Error` line |
| `/health` times out from outside | `dc logs --tail 20 caddy` | Ports 80/443 closed in the Azure **Network settings** (inbound rules), or VM stopped |
| Caddy log: "Timeout during connect (likely firewall problem)" | Azure → VM → Networking | Add inbound rule TCP 80,443 → then `dc restart caddy` |
| Website loads but login fails / spins | `dc logs --tail 40 backend` | Backend down, or Gmail SMTP problem (app password) |
| No OTP email | Gmail spam folder, then backend logs | `EMAIL_HOST_PASSWORD` in `.env.server` |
| Vercel build fails at install | Vercel build logs | Install/Build command overrides missing (§8) |
| NFC link shows "This card link is not valid" | Which URL is on the chip | Chip written with an old/unsigned link. Rewrite it from the card's Print page |
| Server feels slow / random crashes | `free -h`, `dc ps` | Out of memory. Consider resizing the VM (Stop → Size → Start) |

**Rolling back a bad release:**
- **Frontend:** Vercel → Deployments → pick the last good one → ⋯ → **Promote to Production** (instant).
- **Backend:** on the server, `git log --oneline -5`, then
  `git checkout <good-commit> && dc up -d --build`. Afterwards return with
  `git checkout main`. ⚠️ This does **not** undo database migrations that
  already ran. If the bad release included a migration, fix forward with a new
  migration instead.

---

## 11. Don'ts

- ❌ `dc down -v` or `docker volume rm …`: **deletes the database and photos.** (`dc down` without `-v` is safe.)
- ❌ `do-release-upgrade` on the server. Stay on Ubuntu 24.04 LTS.
- ❌ Editing a migration that already ran (§7).
- ❌ Committing any `.env*` file except `*.example`.
- ❌ `npm install` in this repo. Use `pnpm install` at the root.
- ❌ `seed_db.py --force` on the server: it **wipes all data** and reloads demo data.
- ❌ Pasting multi-line commands that contain `read` or that prompt for input. Run prompts on their own line.

---

## 12. Working with Claude (agreements)

- Claude explains a command before you run it. You run git **commit/push**
  yourself. Claude prepares the commit message as a file for `git commit -F`.
- Claude never commits/pushes, opens/merges PRs, or changes the live server
  without you asking.
- Secrets never go into the chat. They move between machines as files (`scp`).
- Terminal prompts tell you where a command runs:
  `PS C:\...>` = your PC · `azureuser@smarthealth-server:~$` = the server.
- Linux on the server uses `curl`. On Windows PowerShell use `curl.exe`.
