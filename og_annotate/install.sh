#!/bin/bash

# og_annotate Native Messaging Host Installer
# For macOS and Linux

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="og_annotate"

# Detect platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
    MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    MANIFEST_DIR_CHROMIUM="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux"* ]]; then
    PLATFORM="linux"
    MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    MANIFEST_DIR_CHROMIUM="$HOME/.config/chromium/NativeMessagingHosts"
else
    echo "Unsupported platform: $OSTYPE"
    exit 1
fi

echo "Installing og_annotate native messaging host for $PLATFORM..."

# Build the binary if needed
if [ ! -f "$SCRIPT_DIR/og_annotate" ]; then
    echo "Building og_annotate..."
    cd "$SCRIPT_DIR"
    go build -o og_annotate .
fi

HOST_PATH="$SCRIPT_DIR/og_annotate"

# Make sure the binary is executable
chmod +x "$HOST_PATH"

# Create manifest
MANIFEST_CONTENT='{
  "name": "og_annotate",
  "description": "OpenGrok Annotation Storage Host",
  "path": "'"$HOST_PATH"'",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://'"$1"'/"
  ]
}'

# Install for Chrome
mkdir -p "$MANIFEST_DIR"
echo "$MANIFEST_CONTENT" > "$MANIFEST_DIR/$HOST_NAME.json"
echo "Installed manifest for Chrome at: $MANIFEST_DIR/$HOST_NAME.json"

# Install for Chromium if directory exists
if [ -d "$(dirname "$MANIFEST_DIR_CHROMIUM")" ]; then
    mkdir -p "$MANIFEST_DIR_CHROMIUM"
    echo "$MANIFEST_CONTENT" > "$MANIFEST_DIR_CHROMIUM/$HOST_NAME.json"
    echo "Installed manifest for Chromium at: $MANIFEST_DIR_CHROMIUM/$HOST_NAME.json"
fi

echo ""
echo "Installation complete!"

if [ -z "$1" ]; then
    echo ""
    echo "IMPORTANT: You need to provide your Chrome extension ID."
    echo "1. Go to chrome://extensions"
    echo "2. Enable 'Developer mode'"
    echo "3. Find 'OpenGrok to VS Code' and copy its ID"
    echo "4. Re-run this script with the extension ID:"
    echo "   $0 <extension-id>"
    echo ""
    echo "Example:"
    echo "   $0 abcdefghijklmnopqrstuvwxyz123456"
else
    echo "Configured for extension ID: $1"
fi
