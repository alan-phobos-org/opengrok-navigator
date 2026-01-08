#!/bin/bash

# og_annotate Native Messaging Host Installer
# For macOS and Linux
# Uses pre-built binaries - no Go compiler required

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="og_annotate"

# Color output helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Detect platform and architecture
detect_platform() {
    case "$OSTYPE" in
        darwin*)
            PLATFORM="darwin"
            ;;
        linux*)
            PLATFORM="linux"
            ;;
        *)
            error "Unsupported platform: $OSTYPE"
            exit 1
            ;;
    esac

    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64|amd64)
            ARCH="amd64"
            ;;
        arm64|aarch64)
            ARCH="arm64"
            ;;
        *)
            error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac

    info "Detected platform: $PLATFORM-$ARCH"
}

# Get manifest directories for Chrome/Chromium
get_manifest_dirs() {
    if [[ "$PLATFORM" == "darwin" ]]; then
        CHROME_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
        CHROMIUM_MANIFEST_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
        CHROME_EXTENSIONS_DIR="$HOME/Library/Application Support/Google/Chrome/Default/Extensions"
        CHROMIUM_EXTENSIONS_DIR="$HOME/Library/Application Support/Chromium/Default/Extensions"
    else
        CHROME_MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
        CHROMIUM_MANIFEST_DIR="$HOME/.config/chromium/NativeMessagingHosts"
        CHROME_EXTENSIONS_DIR="$HOME/.config/google-chrome/Default/Extensions"
        CHROMIUM_EXTENSIONS_DIR="$HOME/.config/chromium/Default/Extensions"
    fi
}

# Auto-detect Chrome extension ID
# Looks for OpenGrok Navigator extension in Chrome/Chromium extension directories
auto_detect_extension_id() {
    info "Attempting to auto-detect extension ID..."

    local dirs=("$CHROME_EXTENSIONS_DIR" "$CHROMIUM_EXTENSIONS_DIR")

    for ext_dir in "${dirs[@]}"; do
        if [[ ! -d "$ext_dir" ]]; then
            continue
        fi

        # Look through each extension directory
        for ext_id_dir in "$ext_dir"/*/; do
            if [[ ! -d "$ext_id_dir" ]]; then
                continue
            fi

            # Get the extension ID from the directory name
            local ext_id=$(basename "$ext_id_dir")

            # Skip if not a valid extension ID format (32 lowercase letters)
            if [[ ! "$ext_id" =~ ^[a-z]{32}$ ]]; then
                continue
            fi

            # Look for manifest.json in version subdirectories
            for version_dir in "$ext_id_dir"*/; do
                local manifest="$version_dir/manifest.json"
                if [[ -f "$manifest" ]]; then
                    # Check if this is the OpenGrok Navigator extension
                    if grep -q '"name".*[Oo]pen[Gg]rok' "$manifest" 2>/dev/null; then
                        success "Found OpenGrok Navigator extension: $ext_id"
                        DETECTED_EXT_ID="$ext_id"
                        return 0
                    fi
                fi
            done
        done
    done

    warn "Could not auto-detect extension ID"
    return 1
}

# Select the correct binary
select_binary() {
    local binary_name="og_annotate-${PLATFORM}-${ARCH}"
    local binary_path="$SCRIPT_DIR/bin/$binary_name"

    if [[ -f "$binary_path" ]]; then
        BINARY_PATH="$binary_path"
        info "Using pre-built binary: $binary_name"
    elif [[ -f "$SCRIPT_DIR/og_annotate" ]]; then
        BINARY_PATH="$SCRIPT_DIR/og_annotate"
        warn "Using existing og_annotate binary (may not match current platform)"
    else
        # Try to build if Go is available
        if command -v go &> /dev/null; then
            info "Pre-built binary not found, building with Go..."
            cd "$SCRIPT_DIR"
            go build -ldflags="-s -w" -o og_annotate .
            BINARY_PATH="$SCRIPT_DIR/og_annotate"
            success "Built og_annotate successfully"
        else
            error "No pre-built binary found for $PLATFORM-$ARCH"
            error "Please ensure bin/og_annotate-${PLATFORM}-${ARCH} exists"
            error "Or install Go and re-run this script"
            exit 1
        fi
    fi
}

# Copy binary to installation location
install_binary() {
    local install_dir="$HOME/.local/bin"
    mkdir -p "$install_dir"

    HOST_PATH="$install_dir/og_annotate"
    cp "$BINARY_PATH" "$HOST_PATH"
    chmod +x "$HOST_PATH"
    success "Installed binary to: $HOST_PATH"
}

# Create and install manifest
install_manifest() {
    local ext_id="$1"

    # Create manifest content
    local manifest_content='{
  "name": "og_annotate",
  "description": "OpenGrok Annotation Storage Host",
  "path": "'"$HOST_PATH"'",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://'"$ext_id"'/"
  ]
}'

    # Install for Chrome
    mkdir -p "$CHROME_MANIFEST_DIR"
    echo "$manifest_content" > "$CHROME_MANIFEST_DIR/$HOST_NAME.json"
    success "Installed manifest for Chrome: $CHROME_MANIFEST_DIR/$HOST_NAME.json"

    # Install for Chromium if parent directory exists
    if [[ -d "$(dirname "$CHROMIUM_MANIFEST_DIR")" ]]; then
        mkdir -p "$CHROMIUM_MANIFEST_DIR"
        echo "$manifest_content" > "$CHROMIUM_MANIFEST_DIR/$HOST_NAME.json"
        success "Installed manifest for Chromium: $CHROMIUM_MANIFEST_DIR/$HOST_NAME.json"
    fi
}

# Show usage
usage() {
    echo ""
    echo "OpenGrok Annotation Native Host Installer"
    echo "=========================================="
    echo ""
    echo "Usage: $0 [extension-id]"
    echo ""
    echo "Options:"
    echo "  extension-id    Chrome extension ID (optional - will auto-detect if not provided)"
    echo ""
    echo "The extension ID will be auto-detected by searching for the OpenGrok Navigator"
    echo "extension in your Chrome/Chromium profile. If auto-detection fails, you can"
    echo "find the ID manually:"
    echo ""
    echo "  1. Go to chrome://extensions"
    echo "  2. Enable 'Developer mode'"
    echo "  3. Find 'OpenGrok to VS Code' and copy its ID"
    echo ""
    echo "Example:"
    echo "  $0                              # Auto-detect extension ID"
    echo "  $0 abcdefghijklmnopqrstuvwxyz   # Specify extension ID manually"
    echo ""
}

# Main installation flow
main() {
    echo ""
    echo "=========================================="
    echo "OpenGrok Annotation Native Host Installer"
    echo "=========================================="
    echo ""

    # Parse arguments
    local ext_id="$1"

    if [[ "$ext_id" == "-h" || "$ext_id" == "--help" ]]; then
        usage
        exit 0
    fi

    # Detect platform
    detect_platform
    get_manifest_dirs

    # Get extension ID (auto-detect or use provided)
    if [[ -z "$ext_id" ]]; then
        if auto_detect_extension_id; then
            ext_id="$DETECTED_EXT_ID"
        else
            echo ""
            warn "Extension ID not provided and auto-detection failed."
            echo ""
            echo "Please provide the extension ID manually:"
            echo "  $0 <extension-id>"
            echo ""
            echo "To find your extension ID:"
            echo "  1. Go to chrome://extensions"
            echo "  2. Enable 'Developer mode'"
            echo "  3. Find 'OpenGrok to VS Code' and copy its ID"
            echo ""
            exit 1
        fi
    fi

    # Validate extension ID format
    if [[ ! "$ext_id" =~ ^[a-z]{32}$ ]]; then
        error "Invalid extension ID format: $ext_id"
        error "Extension IDs are 32 lowercase letters (a-z)"
        exit 1
    fi

    info "Using extension ID: $ext_id"

    # Select and install binary
    select_binary
    install_binary

    # Install manifest
    install_manifest "$ext_id"

    echo ""
    echo "=========================================="
    success "Installation complete!"
    echo "=========================================="
    echo ""
    echo "Binary installed at: $HOST_PATH"
    echo "Extension ID: $ext_id"
    echo ""
    echo "Please restart Chrome for changes to take effect."
    echo ""
}

main "$@"
