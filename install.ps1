# OpenGrok Navigator Unified Installer for Windows
# Installs: VS Code extension, Chrome extension, og_annotate native host

param(
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallDir = "$env:LOCALAPPDATA\opengrok-navigator"

function Write-Info { param($Message) Write-Host "[INFO] " -ForegroundColor Cyan -NoNewline; Write-Host $Message }
function Write-Success { param($Message) Write-Host "[OK] " -ForegroundColor Green -NoNewline; Write-Host $Message }
function Write-Warn { param($Message) Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $Message }
function Write-Err { param($Message) Write-Host "[ERROR] " -ForegroundColor Red -NoNewline; Write-Host $Message }
function Write-Header { param($Message) Write-Host "`n=== $Message ===`n" -ForegroundColor White }

function Get-Architecture {
    if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or $env:PROCESSOR_ARCHITEW6432 -eq "ARM64") {
        return "arm64"
    }
    return "amd64"
}

# --- VS Code ---

function Find-VSCodeCLI {
    # Check PATH
    $code = Get-Command code -ErrorAction SilentlyContinue
    if ($code) { return $code.Source }

    # Common Windows locations
    $paths = @(
        "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd"
        "$env:ProgramFiles\Microsoft VS Code\bin\code.cmd"
        "${env:ProgramFiles(x86)}\Microsoft VS Code\bin\code.cmd"
        "$env:LOCALAPPDATA\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd"
    )

    foreach ($path in $paths) {
        if (Test-Path $path) { return $path }
    }

    return $null
}

function Install-VSCodeExtension {
    Write-Header "VS Code Extension"

    $vsix = Get-ChildItem -Path $ScriptDir -Filter "*.vsix" -ErrorAction SilentlyContinue | Select-Object -First 1

    if (-not $vsix) {
        Write-Warn "No .vsix file found"
        return $false
    }

    Write-Info "Found: $($vsix.Name)"

    $codeCli = Find-VSCodeCLI
    if ($codeCli) {
        Write-Info "Using VS Code CLI: $codeCli"
        try {
            $output = & $codeCli --install-extension $vsix.FullName 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Success "VS Code extension installed"
                return $true
            }
        } catch {
            # Continue to manual instructions
        }
    }

    Write-Warn "VS Code CLI not found or failed"
    Write-Host ""
    Write-Host "To install manually:"
    Write-Host "  1. Open VS Code"
    Write-Host "  2. Go to Extensions (Ctrl+Shift+X)"
    Write-Host "  3. Click '...' menu > 'Install from VSIX...'"
    Write-Host "  4. Select: $($vsix.FullName)"
    Write-Host ""
    return $false
}

# --- Chrome Extension ---

function Install-ChromeExtension {
    Write-Header "Chrome Extension"

    $chromeZip = Join-Path $ScriptDir "opengrok-navigator-chrome.zip"
    $chromeDir = Join-Path $InstallDir "chrome-extension"

    if (-not (Test-Path $chromeZip)) {
        Write-Warn "Chrome extension zip not found"
        return $false
    }

    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    if (Test-Path $chromeDir) {
        Remove-Item -Path $chromeDir -Recurse -Force
    }

    Expand-Archive -Path $chromeZip -DestinationPath $chromeDir -Force
    Write-Success "Extracted to: $chromeDir"

    # Try to open Chrome extensions page
    try {
        Start-Process "chrome://extensions/" -ErrorAction SilentlyContinue
    } catch {
        # Ignore if Chrome not found
    }

    Write-Host ""
    Write-Host "To complete Chrome installation:"
    Write-Host "  1. Open Chrome and go to: chrome://extensions/"
    Write-Host "  2. Enable 'Developer mode' (toggle in top right)"
    Write-Host "  3. Click 'Load unpacked'"
    Write-Host "  4. Select: $chromeDir"
    Write-Host ""

    return $true
}

# --- og_annotate ---

function Install-OgAnnotate {
    Write-Header "og_annotate Native Host"

    $ogZip = Join-Path $ScriptDir "og_annotate.zip"
    $ogDir = $null
    $cleanupTemp = $false

    if (Test-Path $ogZip) {
        $ogDir = Join-Path $InstallDir "og_annotate_temp"
        if (Test-Path $ogDir) { Remove-Item -Path $ogDir -Recurse -Force }
        Expand-Archive -Path $ogZip -DestinationPath $ogDir -Force
        Write-Info "Extracted og_annotate package"
        $cleanupTemp = $true
    } elseif (Test-Path (Join-Path $ScriptDir "og_annotate")) {
        $ogDir = Join-Path $ScriptDir "og_annotate"
    } else {
        Write-Warn "og_annotate not found"
        return $false
    }

    # Detect architecture
    $arch = Get-Architecture
    Write-Info "Architecture: windows-$arch"

    $binaryName = "og_annotate-windows-$arch.exe"
    $binarySrc = Join-Path $ogDir "bin\$binaryName"

    if (-not (Test-Path $binarySrc)) {
        # Try building if Go is available
        $goPath = Get-Command go -ErrorAction SilentlyContinue
        $mainGo = Join-Path $ogDir "main.go"
        if ($goPath -and (Test-Path $mainGo)) {
            Write-Info "Pre-built binary not found, building with Go..."
            Push-Location $ogDir
            try {
                & go build -ldflags="-s -w" -o og_annotate.exe .
                if ($LASTEXITCODE -eq 0) {
                    $binarySrc = Join-Path $ogDir "og_annotate.exe"
                }
            } finally {
                Pop-Location
            }
        }

        if (-not (Test-Path $binarySrc)) {
            Write-Err "Binary not found: $binarySrc"
            if ($cleanupTemp) { Remove-Item -Path $ogDir -Recurse -Force }
            return $false
        }
    }

    # Install binary
    $ogInstallDir = "$env:LOCALAPPDATA\og_annotate"
    if (-not (Test-Path $ogInstallDir)) {
        New-Item -ItemType Directory -Path $ogInstallDir -Force | Out-Null
    }

    $hostPath = Join-Path $ogInstallDir "og_annotate.exe"
    Copy-Item -Path $binarySrc -Destination $hostPath -Force
    Write-Success "Installed binary: $hostPath"

    # Auto-detect extension ID
    $extId = $null
    $chromeExtDir = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Extensions"

    if (Test-Path $chromeExtDir) {
        $found = $false
        Get-ChildItem -Path $chromeExtDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            if ($found) { return }
            $id = $_.Name
            if ($id -match "^[a-z]{32}$") {
                Get-ChildItem -Path $_.FullName -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                    if ($found) { return }
                    $manifest = Join-Path $_.FullName "manifest.json"
                    if (Test-Path $manifest) {
                        $content = Get-Content $manifest -Raw -ErrorAction SilentlyContinue
                        if ($content -match "OpenGrok|opengrok") {
                            $extId = $id
                            $found = $true
                            Write-Success "Auto-detected extension ID: $extId"
                        }
                    }
                }
            }
        }
    }

    if (-not $extId) {
        Write-Warn "Could not auto-detect extension ID"
        Write-Host ""
        Write-Host "After loading the Chrome extension, re-run this installer"
        Write-Host "or manually run:"
        Write-Host "  $ScriptDir\og_annotate\install.ps1 <extension-id>"
        Write-Host ""
        Write-Host "To find extension ID:"
        Write-Host "  1. Go to chrome://extensions"
        Write-Host "  2. Enable 'Developer mode'"
        Write-Host "  3. Find 'OpenGrok to VS Code' and copy its ID"
        Write-Host ""
        if ($cleanupTemp) { Remove-Item -Path $ogDir -Recurse -Force }
        return $false
    }

    # Create manifest
    $manifestPath = Join-Path $ogInstallDir "og_annotate.json"
    $escapedPath = $hostPath.Replace("\", "\\")
    $manifest = @{
        name = "og_annotate"
        description = "OpenGrok Annotation Storage Host"
        path = $hostPath
        type = "stdio"
        allowed_origins = @("chrome-extension://$extId/")
    }
    $manifest | ConvertTo-Json | Set-Content -Path $manifestPath -Encoding UTF8
    Write-Success "Created manifest: $manifestPath"

    # Register in registry
    $regPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\og_annotate"
    $regParent = Split-Path $regPath
    if (-not (Test-Path $regParent)) {
        New-Item -Path $regParent -Force | Out-Null
    }
    if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }
    Set-ItemProperty -Path $regPath -Name "(Default)" -Value $manifestPath
    Write-Success "Registered with Chrome registry"

    # Cleanup
    if ($cleanupTemp -and (Test-Path (Join-Path $InstallDir "og_annotate_temp"))) {
        Remove-Item -Path (Join-Path $InstallDir "og_annotate_temp") -Recurse -Force
    }

    return $true
}

function Show-Usage {
    Write-Host ""
    Write-Host "OpenGrok Navigator Unified Installer" -ForegroundColor White
    Write-Host "=====================================" -ForegroundColor White
    Write-Host ""
    Write-Host "Usage: .\install.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Help    Show this help message"
    Write-Host ""
    Write-Host "This script installs:"
    Write-Host "  - VS Code extension (via 'code' CLI or manual instructions)"
    Write-Host "  - Chrome extension (extracts to %LOCALAPPDATA%\opengrok-navigator\)"
    Write-Host "  - og_annotate native host (for Chrome annotation storage)"
    Write-Host ""
}

# --- Main ---

if ($Help) {
    Show-Usage
    exit 0
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor White
Write-Host " OpenGrok Navigator - Unified Installer" -ForegroundColor White
Write-Host "==============================================" -ForegroundColor White
Write-Host ""

$arch = Get-Architecture
Write-Info "Platform: windows-$arch"

$vscodeOk = Install-VSCodeExtension
$chromeOk = Install-ChromeExtension
$nativeOk = Install-OgAnnotate

Write-Header "Installation Summary"

if ($vscodeOk) { Write-Success "VS Code extension: Installed" }
else { Write-Warn "VS Code extension: Manual steps required" }

if ($chromeOk) { Write-Success "Chrome extension: Extracted" }
else { Write-Warn "Chrome extension: Not found" }

if ($nativeOk) { Write-Success "Native host: Installed" }
else { Write-Warn "Native host: Manual steps required" }

Write-Host ""
Write-Host "Please restart Chrome and VS Code for changes to take effect."
Write-Host ""
