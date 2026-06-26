@echo off
chcp 65001 >nul
title GrantPro - LAN
cd /d "%~dp0"
echo Starting GrantPro in LAN mode (other devices on your network can connect)...
echo.
powershell -ExecutionPolicy Bypass -File "scripts\serve-lan.ps1"
pause
