# Dev mode: backend (auto-reload) + frontend (Vite HMR) in two windows.
# NOTE: kept ASCII-only so Windows PowerShell 5.1 parses it regardless of code page.
$root = Split-Path $PSScriptRoot -Parent

Write-Host "Starting backend sidecar (http://127.0.0.1:8766) ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8766"
)

Write-Host "Starting frontend Vite (http://localhost:5183) ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$root\frontend'; npm run dev"
)

Start-Sleep -Seconds 4
Start-Process "http://localhost:5183"
Write-Host "Dev servers launched in two new windows. Frontend: 5183, Backend: 8766" -ForegroundColor Green
