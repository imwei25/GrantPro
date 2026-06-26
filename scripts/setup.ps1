# One-time setup: create Python venv, install deps, build frontend.
# NOTE: kept ASCII-only so Windows PowerShell 5.1 parses it regardless of code page.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$mirror = "https://pypi.tuna.tsinghua.edu.cn/simple"

Write-Host "==> Creating Python virtual environment" -ForegroundColor Cyan
Set-Location "$root\backend"
if (-not (Test-Path ".venv")) { python -m venv .venv }
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip -i $mirror
& ".\.venv\Scripts\python.exe" -m pip install -i $mirror -r requirements.txt

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created backend\.env - please fill in your model API key." -ForegroundColor Yellow
}

Write-Host "==> Installing frontend dependencies" -ForegroundColor Cyan
Set-Location "$root\frontend"
npm install --registry=https://registry.npmmirror.com --no-fund --no-audit

Write-Host "==> Building frontend" -ForegroundColor Cyan
npm run build

Set-Location $root
Write-Host ""
Write-Host "Setup complete! Double-click the start .bat file in this folder to run." -ForegroundColor Green
