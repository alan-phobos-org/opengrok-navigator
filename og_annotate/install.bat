@echo off
REM og_annotate Native Messaging Host Installer for Windows

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set HOST_NAME=og_annotate
set EXT_ID=%1

if "%EXT_ID%"=="" (
    echo.
    echo OpenGrok Annotation Native Host Installer
    echo ==========================================
    echo.
    echo Usage: install.bat ^<extension-id^>
    echo.
    echo To find your extension ID:
    echo   1. Go to chrome://extensions
    echo   2. Enable 'Developer mode'
    echo   3. Find 'OpenGrok to VS Code' and copy its ID
    echo.
    echo Example:
    echo   install.bat abcdefghijklmnopqrstuvwxyz123456
    echo.
    exit /b 1
)

echo Installing og_annotate native messaging host...

REM Check if binary exists
if not exist "%SCRIPT_DIR%og_annotate.exe" (
    echo Building og_annotate.exe...
    cd /d "%SCRIPT_DIR%"
    go build -o og_annotate.exe .
    if errorlevel 1 (
        echo Failed to build og_annotate.exe
        exit /b 1
    )
)

set HOST_PATH=%SCRIPT_DIR%og_annotate.exe

REM Create manifest file
set MANIFEST_PATH=%SCRIPT_DIR%og_annotate.json
(
echo {
echo   "name": "og_annotate",
echo   "description": "OpenGrok Annotation Storage Host",
echo   "path": "%HOST_PATH:\=\\%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://%EXT_ID%/"
echo   ]
echo }
) > "%MANIFEST_PATH%"

REM Register with Chrome via registry
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\og_annotate" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f

if errorlevel 1 (
    echo Failed to register native messaging host
    exit /b 1
)

echo.
echo Installation complete!
echo.
echo Manifest installed at: %MANIFEST_PATH%
echo Registry key added: HKCU\Software\Google\Chrome\NativeMessagingHosts\og_annotate
echo.
echo Please restart Chrome for changes to take effect.
