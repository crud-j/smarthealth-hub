<#
.SYNOPSIS
  Build and start SmartHealth Hub in PRODUCTION mode on Windows (no Docker).

.DESCRIPTION
  1. Checks PostgreSQL and Redis are reachable (tries to start Redis in WSL).
  2. Validates secrets with ENVIRONMENT=production (scripts/validate_secrets.py --strict).
  3. Applies database migrations (alembic upgrade head).
  4. Builds the Next.js frontend (npm run build:prod).
  5. Opens one window each for: FastAPI, Celery worker, Celery beat, Next.js.

  ENVIRONMENT=production is set for these processes only, so backend\.env can
  keep ENVIRONMENT=development for day-to-day `npm run dev` work.

.EXAMPLE
  .\start-prod.ps1                   # full check + migrate + build + start
  .\start-prod.ps1 -SkipBuild        # reuse the previous frontend build
  .\start-prod.ps1 -ApiWorkers 2     # fewer uvicorn worker processes
#>
param(
    [switch]$SkipBuild,
    [switch]$SkipMigrate,
    [int]$ApiWorkers = 4,
    # 0.0.0.0 keeps :8000 reachable on the LAN — the NFC relay redirects phones
    # to http://<LAN-IP>:8000. Use 127.0.0.1 if you do not need that.
    [string]$ApiHost = "0.0.0.0"
)

$ErrorActionPreference = "Stop"
$Root     = $PSScriptRoot
$Backend  = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend\web"
$EnvFile  = Join-Path $Backend ".env"

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

function Test-TcpPort([string]$HostName, [int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($HostName, $Port, $null, $null)
        return ($async.AsyncWaitHandle.WaitOne(1500) -and $client.Connected)
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Invoke-Checked([string]$WorkDir, [scriptblock]$Command, [string]$What) {
    Push-Location $WorkDir
    try {
        & $Command
        if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)." }
    } finally {
        Pop-Location
    }
}

function Start-ServiceWindow([string]$Title, [string]$WorkDir, [string]$Command) {
    $inner = "`$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
    Start-Process powershell -WorkingDirectory $WorkDir -ArgumentList @("-NoExit", "-Command", $inner) | Out-Null
    Write-Host "  started: $Title"
}

# ── 0. Prerequisites ──────────────────────────────────────────────────────────
Write-Step "Checking prerequisites"
foreach ($tool in "python", "node", "npm") {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "'$tool' is not on PATH." }
}
if (-not (Test-Path $EnvFile)) { throw "backend\.env not found at $EnvFile" }
if (-not (Test-Path (Join-Path $Frontend "node_modules\next"))) {
    throw "Frontend dependencies missing. Run 'pnpm install' in $Root first."
}

$envText  = Get-Content $EnvFile -Raw
$dbHost   = "127.0.0.1"; $dbPort = 5432
$rdHost   = "127.0.0.1"; $rdPort = 6379
if ($envText -match '(?m)^DATABASE_URL=.*@([^:/@]+):(\d+)/') { $dbHost = $Matches[1]; $dbPort = [int]$Matches[2] }
if ($envText -match '(?m)^REDIS_URL=redis://(?:[^@]*@)?([^:/]+):(\d+)')   { $rdHost = $Matches[1]; $rdPort = [int]$Matches[2] }

if (-not (Test-TcpPort $dbHost $dbPort)) { throw "PostgreSQL is not reachable at ${dbHost}:${dbPort}." }
Write-Host "  PostgreSQL OK (${dbHost}:${dbPort})"

if (-not (Test-TcpPort $rdHost $rdPort)) {
    Write-Host "  Redis not reachable at ${rdHost}:${rdPort} - trying to start it in WSL..." -ForegroundColor Yellow
    try { wsl.exe -e redis-server --port $rdPort --daemonize yes | Out-Null } catch { }
    Start-Sleep -Seconds 2
    if (-not (Test-TcpPort $rdHost $rdPort)) {
        throw "Redis is not reachable at ${rdHost}:${rdPort}. In Ubuntu (WSL) run: redis-server --port $rdPort --daemonize yes"
    }
}
Write-Host "  Redis OK (${rdHost}:${rdPort})"

# Every process started from here on (including the new windows) inherits this.
$env:ENVIRONMENT = "production"
$env:PYTHONUNBUFFERED = "1"

# ── 1. Secrets ────────────────────────────────────────────────────────────────
Write-Step "Validating production secrets"
Invoke-Checked $Backend { python scripts/validate_secrets.py --strict } "Secret validation"

# ── 2. Migrations ─────────────────────────────────────────────────────────────
if ($SkipMigrate) {
    Write-Step "Skipping database migrations (-SkipMigrate)"
} else {
    Write-Step "Applying database migrations"
    Invoke-Checked $Backend { python -m alembic upgrade head } "alembic upgrade head"
}

# ── 3. Frontend build ─────────────────────────────────────────────────────────
if ($SkipBuild) {
    Write-Step "Skipping frontend build (-SkipBuild)"
} else {
    Write-Step "Building frontend (npm run build:prod)"
    Invoke-Checked $Frontend { npm run build:prod } "Frontend build"
}

# ── 4. Start services ─────────────────────────────────────────────────────────
Write-Step "Starting services (one window each)"
Start-ServiceWindow "SHH API (prod)" $Backend `
    "python -m uvicorn app.main:app --host $ApiHost --port 8000 --workers $ApiWorkers --proxy-headers --no-server-header"
Start-ServiceWindow "SHH Celery worker (prod)" $Backend `
    "python -m celery -A app.workers.celery_app worker --loglevel=info -P solo"
Start-ServiceWindow "SHH Celery beat (prod)" $Backend `
    "python -m celery -A app.workers.celery_app beat --loglevel=info --schedule=celerybeat-schedule"
Start-ServiceWindow "SHH Web (prod)" $Frontend "npm run start:prod"

Write-Host ""
Write-Host "SmartHealth Hub is starting in production mode:" -ForegroundColor Green
Write-Host "  Web app        http://localhost:3000"
Write-Host "  API health     http://localhost:8000/health"
Write-Host ""
Write-Host "Production cookies are HTTPS-only: use http://localhost:3000 on this PC," -ForegroundColor Yellow
Write-Host "or the Cloudflare tunnel (.\start-tunnel.ps1) for phones and other devices." -ForegroundColor Yellow
