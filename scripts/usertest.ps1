# 一键端到端"真实用户"测试: 构建前端 -> 以 MOCK 模式起后端 -> 跑 Playwright -> 收尾停服务。
# 不消耗任何 API 额度(MOCK_LLM=true)。需先执行过 scripts/setup.ps1。
# NOTE: kept ASCII-only so Windows PowerShell 5.1 parses it regardless of code page.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$py = Join-Path $root "backend\.venv\Scripts\python.exe"
$port = 8766
$base = "http://127.0.0.1:$port"

if (-not (Test-Path $py)) { throw "backend\.venv not found. Run scripts\setup.ps1 first." }

Write-Host "==> Building frontend (so backend can serve dist)" -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
npm run build
Pop-Location

Write-Host "==> Starting backend in MOCK mode on port $port" -ForegroundColor Cyan
$env:MOCK_LLM = "true"
$env:PORT = "$port"
$env:HOST = "127.0.0.1"
$server = Start-Process -FilePath $py `
  -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$port", "--log-level", "warning" `
  -WorkingDirectory (Join-Path $root "backend") -PassThru -WindowStyle Hidden

try {
  # wait for health
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $h = Invoke-RestMethod -Uri "$base/api/health" -TimeoutSec 2
      if ($h.status -eq "ok") { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ready) { throw "Backend did not become healthy in time." }
  Write-Host "==> Backend healthy (mock=$($h.mock)). Running Playwright e2e..." -ForegroundColor Cyan

  Push-Location (Join-Path $root "frontend")
  $env:BASE_URL = $base
  node e2e/usertest.mjs
  $code = $LASTEXITCODE
  Pop-Location
}
finally {
  Write-Host "==> Stopping backend" -ForegroundColor Cyan
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}

if ($code -ne 0) { Write-Host "E2E FAILED (exit $code)" -ForegroundColor Red; exit $code }
Write-Host "E2E PASSED" -ForegroundColor Green
