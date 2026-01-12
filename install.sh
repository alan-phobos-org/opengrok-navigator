#!/bin/bash

# OpenGrok Navigator Unified Installer
# Installs: VS Code extension, Chrome extension, og_annotate native host
# Works on macOS and Linux

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/.opengrok-navigator"

# Color helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }
header()  { echo -e "\n${BOLD}=== $1 ===${NC}\n"; }

# Detect platform
detect_platform() {
    case "$OSTYPE" in
        darwin*) PLATFORM="darwin" ;;
        linux*)  PLATFORM="linux" ;;
        *)
            error "Unsupported platform: $OSTYPE"
            exit 1
            ;;
    esac

    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64|amd64) ARCH="amd64" ;;
        arm64|aarch64) ARCH="arm64" ;;
        *)
            error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac
}

# --- VS Code Installation ---

find_vscode_cli() {
    # Check PATH first
    if command -v code &>/dev/null; then
        CODE_CLI="code"
        return 0
    fi

    # macOS locations
    local macos_paths=(
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
        "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code"
        "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
    )

    # Linux locations
    local linux_paths=(
        "/usr/bin/code"
        "/usr/share/code/bin/code"
        "/snap/bin/code"
        "/var/lib/flatpak/exports/bin/com.visualstudio.code"
    )

    local paths=()
    case "$PLATFORM" in
        darwin) paths=("${macos_paths[@]}") ;;
        linux)  paths=("${linux_paths[@]}") ;;
    esac

    for path in "${paths[@]}"; do
        if [[ -x "$path" ]]; then
            CODE_CLI="$path"
            return 0
        fi
    done

    return 1
}

install_vscode_extension() {
    header "VS Code Extension"

    # Find .vsix file
    local vsix_file=$(find "$SCRIPT_DIR" -maxdepth 1 -name "*.vsix" -type f 2>/dev/null | head -1)

    if [[ -z "$vsix_file" ]]; then
        warn "No .vsix file found in $SCRIPT_DIR"
        warn "Skipping VS Code extension installation"
        return 1
    fi

    info "Found: $(basename "$vsix_file")"

    if find_vscode_cli; then
        info "Using VS Code CLI: $CODE_CLI"
        if "$CODE_CLI" --install-extension "$vsix_file" 2>/dev/null; then
            success "VS Code extension installed"
            return 0
        else
            warn "VS Code CLI failed"
        fi
    else
        warn "VS Code CLI not found"
    fi

    # Manual instructions
    echo ""
    echo "To install manually:"
    echo "  1. Open VS Code"
    echo "  2. Go to Extensions (Cmd/Ctrl+Shift+X)"
    echo "  3. Click '...' menu > 'Install from VSIX...'"
    echo "  4. Select: $vsix_file"
    echo ""
    return 1
}

# --- Chrome Extension ---

install_chrome_extension() {
    header "Chrome Extension"

    local chrome_zip="$SCRIPT_DIR/opengrok-navigator-chrome.zip"
    local chrome_dir="$INSTALL_DIR/chrome-extension"

    if [[ ! -f "$chrome_zip" ]]; then
        warn "Chrome extension zip not found: $chrome_zip"
        return 1
    fi

    # Create and extract
    mkdir -p "$chrome_dir"
    rm -rf "$chrome_dir"/*
    unzip -o -q "$chrome_zip" -d "$chrome_dir"
    success "Extracted to: $chrome_dir"

    # Try to open chrome://extensions (macOS)
    if [[ "$PLATFORM" == "darwin" ]]; then
        if [[ -d "/Applications/Google Chrome.app" ]]; then
            info "Opening Chrome extensions page..."
            open "chrome://extensions/" 2>/dev/null || true
        fi
    elif [[ "$PLATFORM" == "linux" ]]; then
        if command -v xdg-open &>/dev/null; then
            info "Opening Chrome extensions page..."
            xdg-open "chrome://extensions/" 2>/dev/null || true
        fi
    fi

    echo ""
    echo "To complete Chrome installation:"
    echo "  1. Open Chrome and go to: chrome://extensions/"
    echo "  2. Enable 'Developer mode' (toggle in top right)"
    echo "  3. Click 'Load unpacked'"
    echo "  4. Select: $chrome_dir"
    echo ""

    return 0
}

# --- og_annotate Native Host ---

install_og_annotate() {
    local provided_ext_id="$1"
    header "og_annotate Native Host"

    # Check if we have og_annotate.zip or the og_annotate directory
    local og_dir=""
    local og_zip="$SCRIPT_DIR/og_annotate.zip"
    local cleanup_temp=false

    if [[ -f "$og_zip" ]]; then
        og_dir="$INSTALL_DIR/og_annotate_temp"
        mkdir -p "$og_dir"
        unzip -o -q "$og_zip" -d "$og_dir"
        info "Extracted og_annotate package"
        cleanup_temp=true
    elif [[ -d "$SCRIPT_DIR/og_annotate" ]]; then
        og_dir="$SCRIPT_DIR/og_annotate"
    else
        warn "og_annotate not found, skipping native host installation"
        return 1
    fi

    # Select binary
    local binary_name="og_annotate-${PLATFORM}-${ARCH}"
    local binary_src="$og_dir/bin/$binary_name"

    if [[ ! -f "$binary_src" ]]; then
        # Try building if Go is available
        if command -v go &>/dev/null && [[ -f "$og_dir/main.go" ]]; then
            info "Pre-built binary not found, building with Go..."
            (cd "$og_dir" && go build -ldflags="-s -w" -o og_annotate .)
            binary_src="$og_dir/og_annotate"
        else
            error "Binary not found: $binary_src"
            [[ "$cleanup_temp" == "true" ]] && rm -rf "$og_dir"
            return 1
        fi
    fi

    info "Platform: $PLATFORM-$ARCH"

    # Install binary
    local bin_dir="$HOME/.local/bin"
    mkdir -p "$bin_dir"
    local host_path="$bin_dir/og_annotate"
    cp "$binary_src" "$host_path"
    chmod +x "$host_path"
    success "Installed binary: $host_path"

    # Use provided extension ID or try auto-detection
    local ext_id="$provided_ext_id"

    if [[ -n "$ext_id" ]]; then
        info "Using provided extension ID: $ext_id"
    else
        # Auto-detect extension ID
        local chrome_ext_dirs=()

        if [[ "$PLATFORM" == "darwin" ]]; then
            chrome_ext_dirs=(
                "$HOME/Library/Application Support/Google/Chrome/Default/Extensions"
                "$HOME/Library/Application Support/Chromium/Default/Extensions"
            )
        else
            chrome_ext_dirs=(
                "$HOME/.config/google-chrome/Default/Extensions"
                "$HOME/.config/chromium/Default/Extensions"
            )
        fi

        for ext_dir in "${chrome_ext_dirs[@]}"; do
            [[ ! -d "$ext_dir" ]] && continue

            for ext_id_dir in "$ext_dir"/*/; do
                local id=$(basename "$ext_id_dir")
                [[ "$id" =~ ^[a-z]{32}$ ]] || continue

                for version_dir in "$ext_id_dir"*/; do
                    local manifest="$version_dir/manifest.json"
                    if [[ -f "$manifest" ]] && grep -qi "opengrok" "$manifest" 2>/dev/null; then
                        ext_id="$id"
                        success "Auto-detected extension ID: $ext_id"
                        break 3
                    fi
                done
            done
        done
    fi

    if [[ -z "$ext_id" ]]; then
        warn "Could not auto-detect extension ID"
        echo ""
        echo "After loading the Chrome extension, re-run this installer with the extension ID:"
        echo "  $0 <extension-id>"
        echo ""
        echo "To find extension ID:"
        echo "  1. Go to chrome://extensions"
        echo "  2. Enable 'Developer mode'"
        echo "  3. Find 'OpenGrok to VS Code' and copy its ID"
        echo ""
        [[ "$cleanup_temp" == "true" ]] && rm -rf "$og_dir"
        return 1
    fi

    # Install manifests
    local manifest_dirs=()
    if [[ "$PLATFORM" == "darwin" ]]; then
        manifest_dirs=(
            "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
            "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
        )
    else
        manifest_dirs=(
            "$HOME/.config/google-chrome/NativeMessagingHosts"
            "$HOME/.config/chromium/NativeMessagingHosts"
        )
    fi

    local manifest_content='{
  "name": "og_annotate",
  "description": "OpenGrok Annotation Storage Host",
  "path": "'"$host_path"'",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://'"$ext_id"'/"
  ]
}'

    for dir in "${manifest_dirs[@]}"; do
        if [[ -d "$(dirname "$dir")" ]]; then
            mkdir -p "$dir"
            echo "$manifest_content" > "$dir/og_annotate.json"
            success "Installed manifest: $dir/og_annotate.json"
        fi
    done

    # Cleanup temp
    [[ "$cleanup_temp" == "true" ]] && rm -rf "$og_dir"

    return 0
}

# --- Main ---

usage() {
    echo ""
    echo "OpenGrok Navigator Unified Installer"
    echo "====================================="
    echo ""
    echo "Usage: $0 [options] [extension-id]"
    echo ""
    echo "Options:"
    echo "  -h, --help    Show this help message"
    echo ""
    echo "Arguments:"
    echo "  extension-id  Chrome extension ID for native host configuration"
    echo "                (use this after loading the extension manually)"
    echo ""
    echo "This script installs:"
    echo "  - VS Code extension (via 'code' CLI or manual instructions)"
    echo "  - Chrome extension (extracts to ~/.opengrok-navigator/)"
    echo "  - og_annotate native host (for Chrome annotation storage)"
    echo ""
}

main() {
    if [[ "$1" == "-h" || "$1" == "--help" ]]; then
        usage
        exit 0
    fi

    # Check for extension ID argument
    local ext_id=""
    if [[ "$1" =~ ^[a-z]{32}$ ]]; then
        ext_id="$1"
    fi

    echo ""
    echo "=============================================="
    echo " OpenGrok Navigator - Unified Installer"
    echo "=============================================="
    echo ""

    detect_platform
    info "Platform: $PLATFORM-$ARCH"

    local vscode_ok=false
    local chrome_ok=false
    local native_ok=false

    install_vscode_extension && vscode_ok=true
    install_chrome_extension && chrome_ok=true
    install_og_annotate "$ext_id" && native_ok=true

    header "Installation Summary"

    [[ "$vscode_ok" == "true" ]] && success "VS Code extension: Installed" || warn "VS Code extension: Manual steps required"
    [[ "$chrome_ok" == "true" ]] && success "Chrome extension: Extracted" || warn "Chrome extension: Not found"
    [[ "$native_ok" == "true" ]] && success "Native host: Installed" || warn "Native host: Manual steps required"

    echo ""
    echo "Please restart Chrome and VS Code for changes to take effect."
    echo ""
}

main "$@"
