# Serve on the local network (LAN): bind to 0.0.0.0 so other devices can connect.
# NOTE: ASCII-only so Windows PowerShell 5.1 parses it regardless of code page.
# WARNING: this exposes the app (and your model API key usage) to everyone on the
#          LAN. Only run on a trusted network.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$py = "$root\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "[Not installed] Run scripts\setup.ps1 first." -ForegroundColor Red
    exit 1
}

# Build the frontend if it has not been built yet (single-process mode serves dist).
if (-not (Test-Path "$root\frontend\dist\index.html")) {
    Write-Host "==> Building frontend (first time) ..." -ForegroundColor Cyan
    Set-Location "$root\frontend"
    npm run build
    Set-Location $root
}

# Read PORT from backend\.env if present, else default 8766.
$port = 8766
$envFile = "$root\backend\.env"
if (Test-Path $envFile) {
    $m = Select-String -Path $envFile -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
    if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
}

# Try to open the firewall port (needs admin; ignore if it fails).
try {
    if (-not (Get-NetFirewallRule -DisplayName "GrantPro $port" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName "GrantPro $port" -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort $port -Profile Private | Out-Null
        Write-Host "Firewall: opened inbound TCP $port (Private profile)." -ForegroundColor DarkGray
    }
} catch {
    Write-Host "Firewall rule not added (need admin). If other devices cannot connect, run as admin:" -ForegroundColor Yellow
    Write-Host "  netsh advfirewall firewall add rule name=`"GrantPro $port`" dir=in action=allow protocol=TCP localport=$port" -ForegroundColor Yellow
}

# Show this machine's LAN IPv4 addresses.
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
    Select-Object -ExpandProperty IPAddress
Write-Host ""
Write-Host "==> GrantPro is now reachable on your LAN at:" -ForegroundColor Green
foreach ($ip in $ips) { Write-Host "      http://$ip`:$port" -ForegroundColor Green }
Write-Host "    (open one of these on another PC/phone on the same Wi-Fi/router)"
Write-Host "    Local access still works at http://127.0.0.1:$port"
Write-Host "    Press Ctrl+C in this window to stop." -ForegroundColor DarkGray
Write-Host ""

# Bind to all interfaces. HOST env overrides backend/.env; PORT comes from .env/default.
$env:HOST = "0.0.0.0"
Set-Location "$root\backend"
& $py -m app.main
