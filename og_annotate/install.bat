@echo off
REM og_annotate Native Messaging Host Installer for Windows
REM Uses pre-built binaries - no Go compiler required

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set HOST_NAME=og_annotate
set EXT_ID=%1

echo.
echo ==========================================
echo OpenGrok Annotation Native Host Installer
echo ==========================================
echo.

REM Check for help flag
if "%1"=="-h" goto :usage
if "%1"=="--help" goto :usage
if "%1"=="/?" goto :usage

REM Detect architecture
set ARCH=amd64
if "%PROCESSOR_ARCHITECTURE%"=="ARM64" set ARCH=arm64
if "%PROCESSOR_ARCHITEW6432%"=="ARM64" set ARCH=arm64

echo [INFO] Detected architecture: windows-%ARCH%

REM Try to auto-detect extension ID if not provided
if "%EXT_ID%"=="" (
    echo [INFO] Attempting to auto-detect extension ID...
    call :auto_detect_extension
    if "!DETECTED_EXT_ID!"=="" (
        echo.
        echo [WARN] Extension ID not provided and auto-detection failed.
        echo.
        goto :usage_short
    )
    set EXT_ID=!DETECTED_EXT_ID!
)

REM Validate extension ID format (should be 32 lowercase letters)
echo %EXT_ID%| findstr /r "^[a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z][a-z]$" >nul
if errorlevel 1 (
    echo [ERROR] Invalid extension ID format: %EXT_ID%
    echo [ERROR] Extension IDs are 32 lowercase letters ^(a-z^)
    exit /b 1
)

echo [INFO] Using extension ID: %EXT_ID%

REM Select the correct binary
set BINARY_NAME=og_annotate-windows-%ARCH%.exe
set BINARY_PATH=%SCRIPT_DIR%bin\%BINARY_NAME%

if exist "%BINARY_PATH%" (
    echo [INFO] Using pre-built binary: %BINARY_NAME%
) else if exist "%SCRIPT_DIR%og_annotate.exe" (
    set BINARY_PATH=%SCRIPT_DIR%og_annotate.exe
    echo [WARN] Using existing og_annotate.exe ^(may not match current architecture^)
) else (
    REM Try to build if Go is available
    where go >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] No pre-built binary found for windows-%ARCH%
        echo [ERROR] Please ensure bin\%BINARY_NAME% exists
        echo [ERROR] Or install Go and re-run this script
        exit /b 1
    )
    echo [INFO] Pre-built binary not found, building with Go...
    cd /d "%SCRIPT_DIR%"
    go build -ldflags="-s -w" -o og_annotate.exe .
    if errorlevel 1 (
        echo [ERROR] Failed to build og_annotate.exe
        exit /b 1
    )
    set BINARY_PATH=%SCRIPT_DIR%og_annotate.exe
    echo [OK] Built og_annotate.exe successfully
)

REM Create installation directory
set INSTALL_DIR=%LOCALAPPDATA%\og_annotate
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Copy binary to installation location
set HOST_PATH=%INSTALL_DIR%\og_annotate.exe
copy /y "%BINARY_PATH%" "%HOST_PATH%" >nul
echo [OK] Installed binary to: %HOST_PATH%

REM Create manifest file
set MANIFEST_PATH=%INSTALL_DIR%\og_annotate.json
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
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\og_annotate" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Failed to register native messaging host in registry
    exit /b 1
)
echo [OK] Registered with Chrome registry

echo.
echo ==========================================
echo [OK] Installation complete!
echo ==========================================
echo.
echo Binary installed at: %HOST_PATH%
echo Manifest installed at: %MANIFEST_PATH%
echo Registry key: HKCU\Software\Google\Chrome\NativeMessagingHosts\og_annotate
echo Extension ID: %EXT_ID%
echo.
echo Please restart Chrome for changes to take effect.
echo.
exit /b 0

:auto_detect_extension
REM Search for OpenGrok extension in Chrome's extension directories
set DETECTED_EXT_ID=

REM Check Chrome extensions directory
set CHROME_EXT_DIR=%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions
if exist "%CHROME_EXT_DIR%" (
    for /d %%i in ("%CHROME_EXT_DIR%\*") do (
        set EXT_DIR_NAME=%%~ni
        REM Check if directory name is 32 characters (extension ID format)
        call :strlen "!EXT_DIR_NAME!" EXT_LEN
        if "!EXT_LEN!"=="32" (
            REM Look for manifest.json in version subdirectories
            for /d %%v in ("%%i\*") do (
                if exist "%%v\manifest.json" (
                    findstr /i /c:"OpenGrok" "%%v\manifest.json" >nul 2>&1
                    if not errorlevel 1 (
                        set DETECTED_EXT_ID=!EXT_DIR_NAME!
                        echo [OK] Found OpenGrok Navigator extension: !DETECTED_EXT_ID!
                        exit /b 0
                    )
                )
            )
        )
    )
)

echo [WARN] Could not auto-detect extension ID
exit /b 1

:strlen
setlocal enabledelayedexpansion
set str=%~1
set len=0
:strlen_loop
if defined str (
    set str=!str:~1!
    set /a len+=1
    goto :strlen_loop
)
endlocal & set %2=%len%
exit /b 0

:usage
echo.
echo OpenGrok Annotation Native Host Installer
echo ==========================================
echo.
echo Usage: %~nx0 [extension-id]
echo.
echo Options:
echo   extension-id    Chrome extension ID ^(optional - will auto-detect if not provided^)
echo.
echo The extension ID will be auto-detected by searching for the OpenGrok Navigator
echo extension in your Chrome profile. If auto-detection fails, you can find the
echo ID manually:
echo.
echo   1. Go to chrome://extensions
echo   2. Enable 'Developer mode'
echo   3. Find 'OpenGrok to VS Code' and copy its ID
echo.
echo Example:
echo   %~nx0                              # Auto-detect extension ID
echo   %~nx0 abcdefghijklmnopqrstuvwxyz   # Specify extension ID manually
echo.
exit /b 0

:usage_short
echo Please provide the extension ID manually:
echo   %~nx0 ^<extension-id^>
echo.
echo To find your extension ID:
echo   1. Go to chrome://extensions
echo   2. Enable 'Developer mode'
echo   3. Find 'OpenGrok to VS Code' and copy its ID
echo.
exit /b 1
