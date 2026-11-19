# SmartHealth Hub - copy the newest server backup to this PC.
#
# Usage (PowerShell, repo root):   .\scripts\download-backup.ps1
# Run it weekly. Files go to $HOME\SmartHealthBackups, which is outside
# OneDrive on purpose: the backups contain patient data.
# Never keep .env.server / ENCRYPTION_KEY in the same folder.

param(
    [string]$Server = "azureuser@smarthealth-hub.japaneast.cloudapp.azure.com",
    [string]$Destination = (Join-Path $HOME "SmartHealthBackups")
)

$ErrorActionPreference = "Stop"
$remoteDir = "/var/backups/smarthealth"

New-Item -ItemType Directory -Force -Path $Destination | Out-Null

Write-Host "Asking the server for the newest backup..."
$latest = ssh $Server "cd $remoteDir && ls -1t db-*.dump | head -n 1 && ls -1t media-*.tar.gz | head -n 1"
if ($LASTEXITCODE -ne 0 -or -not $latest) {
    Write-Host "No backups found on the server (or SSH failed). Is the VM running?" -ForegroundColor Red
    exit 1
}

foreach ($file in @($latest)) {
    $target = Join-Path $Destination $file
    if (Test-Path $target) {
        Write-Host "Already downloaded: $file"
        continue
    }
    Write-Host "Downloading $file ..."
    scp "${Server}:$remoteDir/$file" $Destination
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Download failed: $file" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Backups on this PC ($Destination):" -ForegroundColor Green
Get-ChildItem $Destination |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 6 Name, @{ Name = "MB"; Expression = { [math]::Round($_.Length / 1MB, 2) } }, LastWriteTime |
    Format-Table -AutoSize
