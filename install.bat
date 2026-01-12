@echo off
REM OpenGrok Navigator Installer - Windows wrapper
REM Calls PowerShell installer script

PowerShell -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
pause
