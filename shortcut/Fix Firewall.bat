@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
powershell.exe -Sta -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-firewall.ps1"
pause
