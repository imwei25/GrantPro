@echo off
chcp 65001 >nul
title NSFC Grant Assistant
cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
    echo [Not installed] Please run scripts\setup.ps1 first ^(right-click - Run with PowerShell^).
    pause
    exit /b
)

echo Starting NSFC Grant Assistant, please wait...
start "NSFC-Server" /min ".venv\Scripts\python.exe" -m app.main
timeout /t 4 /nobreak >nul
start "" http://127.0.0.1:8766
echo.
echo NSFC Grant Assistant is running. Your browser will open automatically.
echo Keep this window open while using the app; close it to quit.
echo.
pause
