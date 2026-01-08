# og_annotate Native Messaging Host Installer for Windows (PowerShell)
# Uses pre-built binaries - no Go compiler required

param(
    [Parameter(Position=0)]
    [string]$ExtensionId,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HostName = "og_annotate"

function Write-Info { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Success { param($Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warning { param($Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

function Show-Usage {
    Write-Host ""
    Write-Host "OpenGrok Annotation Native Host Installer" -ForegroundColor White
    Write-Host "==========================================" -ForegroundColor White
    Write-Host ""
    Write-Host "Usage: .\install.ps1 [extension-id]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  extension-id    Chrome extension ID (optional - will auto-detect if not provided)"
    Write-Host "  -Help           Show this help message"
    Write-Host ""
    Write-Host "The extension ID will be auto-detected by searching for the OpenGrok Navigator"
    Write-Host "extension in your Chrome profile. If auto-detection fails, you can find the"
    Write-Host "ID manually:"
    Write-Host ""
    Write-Host "  1. Go to chrome://extensions"
    Write-Host "  2. Enable 'Developer mode'"
    Write-Host "  3. Find 'OpenGrok to VS Code' and copy its ID"
    Write-Host ""
    Write-Host "Example:"
    Write-Host "  .\install.ps1                              # Auto-detect extension ID"
    Write-Host "  .\install.ps1 abcdefghijklmnopqrstuvwxyz   # Specify extension ID manually"
    Write-Host ""
}

function Get-Architecture {
    if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or $env:PROCESSOR_ARCHITEW6432 -eq "ARM64") {
        return "arm64"
    }
    return "amd64"
}

function Find-OpenGrokExtension {
    Write-Info "Attempting to auto-detect extension ID..."

    $chromeExtDir = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Extensions"

    if (-not (Test-Path $chromeExtDir)) {
        Write-Warning "Chrome extensions directory not found"
        return $null
    }

    Get-ChildItem -Path $chromeExtDir -Directory | ForEach-Object {
        $extId = $_.Name

        # Extension IDs are 32 lowercase letters
        if ($extId -match "^[a-z]{32}$") {
            # Look for manifest.json in version subdirectories
            Get-ChildItem -Path $_.FullName -Directory | ForEach-Object {
                $manifest = Join-Path $_.FullName "manifest.json"
                if (Test-Path $manifest) {
                    $content = Get-Content $manifest -Raw -ErrorAction SilentlyContinue
                    if ($content -match "OpenGrok|opengrok") {
                        Write-Success "Found OpenGrok Navigator extension: $extId"
                        return $extId
                    }
                }
            }
        }
    }

    Write-Warning "Could not auto-detect extension ID"
    return $null
}

function Get-BinaryPath {
    param([string]$Arch)

    $binaryName = "og_annotate-windows-$Arch.exe"
    $binaryPath = Join-Path $ScriptDir "bin\$binaryName"

    if (Test-Path $binaryPath) {
        Write-Info "Using pre-built binary: $binaryName"
        return $binaryPath
    }

    $legacyPath = Join-Path $ScriptDir "og_annotate.exe"
    if (Test-Path $legacyPath) {
        Write-Warning "Using existing og_annotate.exe (may not match current architecture)"
        return $legacyPath
    }

    # Try to build if Go is available
    $goPath = Get-Command go -ErrorAction SilentlyContinue
    if ($goPath) {
        Write-Info "Pre-built binary not found, building with Go..."
        Push-Location $ScriptDir
        try {
            & go build -ldflags="-s -w" -o og_annotate.exe .
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Built og_annotate.exe successfully"
                return (Join-Path $ScriptDir "og_annotate.exe")
            }
        }
        finally {
            Pop-Location
        }
    }

    throw "No pre-built binary found for windows-$Arch. Please ensure bin\$binaryName exists or install Go."
}

function Install-NativeHost {
    param(
        [string]$BinaryPath,
        [string]$ExtId
    )

    # Create installation directory
    $installDir = "$env:LOCALAPPDATA\og_annotate"
    if (-not (Test-Path $installDir)) {
        New-Item -ItemType Directory -Path $installDir | Out-Null
    }

    # Copy binary
    $hostPath = Join-Path $installDir "og_annotate.exe"
    Copy-Item -Path $BinaryPath -Destination $hostPath -Force
    Write-Success "Installed binary to: $hostPath"

    # Create manifest
    $manifestPath = Join-Path $installDir "og_annotate.json"
    $manifest = @{
        name = "og_annotate"
        description = "OpenGrok Annotation Storage Host"
        path = $hostPath.Replace("\", "\\")
        type = "stdio"
        allowed_origins = @("chrome-extension://$ExtId/")
    }
    $manifest | ConvertTo-Json | Set-Content -Path $manifestPath -Encoding UTF8
    Write-Success "Created manifest: $manifestPath"

    # Register in registry
    $regPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\og_annotate"
    if (-not (Test-Path (Split-Path $regPath))) {
        New-Item -Path (Split-Path $regPath) -Force | Out-Null
    }
    Set-ItemProperty -Path $regPath -Name "(Default)" -Value $manifestPath -ErrorAction SilentlyContinue
    if (-not $?) {
        New-Item -Path $regPath -Force | Out-Null
        Set-ItemProperty -Path $regPath -Name "(Default)" -Value $manifestPath
    }
    Write-Success "Registered with Chrome registry"

    return @{
        HostPath = $hostPath
        ManifestPath = $manifestPath
    }
}

# Main script
Write-Host ""
Write-Host "==========================================" -ForegroundColor White
Write-Host "OpenGrok Annotation Native Host Installer" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor White
Write-Host ""

if ($Help) {
    Show-Usage
    exit 0
}

# Detect architecture
$arch = Get-Architecture
Write-Info "Detected architecture: windows-$arch"

# Get extension ID
if (-not $ExtensionId) {
    $ExtensionId = Find-OpenGrokExtension
    if (-not $ExtensionId) {
        Write-Host ""
        Write-Warning "Extension ID not provided and auto-detection failed."
        Write-Host ""
        Write-Host "Please provide the extension ID manually:"
        Write-Host "  .\install.ps1 <extension-id>"
        Write-Host ""
        Write-Host "To find your extension ID:"
        Write-Host "  1. Go to chrome://extensions"
        Write-Host "  2. Enable 'Developer mode'"
        Write-Host "  3. Find 'OpenGrok to VS Code' and copy its ID"
        Write-Host ""
        exit 1
    }
}

# Validate extension ID
if ($ExtensionId -notmatch "^[a-z]{32}$") {
    Write-Error "Invalid extension ID format: $ExtensionId"
    Write-Error "Extension IDs are 32 lowercase letters (a-z)"
    exit 1
}

Write-Info "Using extension ID: $ExtensionId"

try {
    # Get binary path
    $binaryPath = Get-BinaryPath -Arch $arch

    # Install
    $result = Install-NativeHost -BinaryPath $binaryPath -ExtId $ExtensionId

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor White
    Write-Success "Installation complete!"
    Write-Host "==========================================" -ForegroundColor White
    Write-Host ""
    Write-Host "Binary installed at: $($result.HostPath)"
    Write-Host "Manifest installed at: $($result.ManifestPath)"
    Write-Host "Registry key: HKCU\Software\Google\Chrome\NativeMessagingHosts\og_annotate"
    Write-Host "Extension ID: $ExtensionId"
    Write-Host ""
    Write-Host "Please restart Chrome for changes to take effect."
    Write-Host ""
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
