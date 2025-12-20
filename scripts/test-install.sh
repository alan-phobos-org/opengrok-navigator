#!/usr/bin/env bash
set -euo pipefail

# This script is designed to run on a Linux VM with sudo access.
# It tests the complete OpenGrok installation process end-to-end.
# On macOS, it will run tests [1-3] but skip [4-5] which require sudo/systemd.

echo "=== OpenGrok Setup Test Suite ==="
echo "VM: $(hostname)"

# Detect OS
if [ -f /etc/os-release ]; then
    echo "OS: $(grep PRETTY_NAME /etc/os-release | cut -d'"' -f2)"
else
    echo "OS: $(uname -s) $(uname -r)"
fi

# Display memory (platform-specific)
if command -v free &> /dev/null; then
    echo "Memory: $(free -h | awk '/^Mem:/ {print $2}')"
elif [ "$(uname)" = "Darwin" ]; then
    echo "Memory: $(sysctl hw.memsize | awk '{print int($2/1024/1024/1024) "GB"}')"
fi
echo ""

# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Test 1: Download dependencies
echo "[1/5] Testing download-dependencies.sh..."
cd /tmp
bash "$SCRIPT_DIR/download-dependencies.sh" -y -p test-deps

# Verify downloads
echo "[2/5] Verifying downloaded files..."
required_files=(
    "opengrok-*.tar.gz"
    "apache-tomcat-*.tar.gz"
    "OpenJDK*.tar.gz"
    "MANIFEST.txt"
    "README.txt"
)

for pattern in "${required_files[@]}"; do
    if ! ls test-deps/$pattern 1> /dev/null 2>&1; then
        echo "ERROR: Missing required file: $pattern"
        exit 1
    fi
done

# Check for ctags (support both uctags and ctags naming)
if ! ls test-deps/uctags-*.tar.gz 1> /dev/null 2>&1 && ! ls test-deps/ctags-*.tar.gz 1> /dev/null 2>&1; then
    echo "ERROR: Missing required file: uctags-*.tar.gz or ctags-*.tar.gz"
    exit 1
fi

echo "✓ All files downloaded successfully"

# Test 2: Prepare test source code
echo "[3/5] Creating test source code..."
mkdir -p /tmp/test-source/demo-project
cat > /tmp/test-source/demo-project/hello.c << 'EOF'
#include <stdio.h>

int main() {
    printf("Hello, OpenGrok!\n");
    return 0;
}
EOF

cat > /tmp/test-source/demo-project/utils.c << 'EOF'
#include <string.h>

int string_length(const char* str) {
    return strlen(str);
}
EOF
echo "✓ Test source created"

# Test 3: Run installation (Linux only)
if [ "$(uname)" != "Linux" ]; then
    echo "[4/5] Skipping install test (requires Linux with sudo)"
    echo "[5/5] Skipping verification (requires Linux with sudo)"
    echo ""
    echo "=== Partial Tests Passed (Download & Verification) ==="
    echo "Run this script on a Linux VM for full end-to-end testing."
    exit 0
fi

echo "[4/5] Testing install-opengrok.sh..."
sudo bash "$SCRIPT_DIR/install-opengrok.sh" \
    -y \
    --indexer-memory 2048 \
    /tmp/test-deps \
    /tmp/test-source

# Test 4: Verify installation
echo "[5/5] Verifying installation..."

# Check installed components
if [ ! -d /opt/java ]; then
    echo "ERROR: Java not installed"
    exit 1
fi
echo "✓ Java installed"

if ! command -v ctags &> /dev/null; then
    echo "ERROR: Ctags not installed"
    exit 1
fi
echo "✓ Ctags installed"

if [ ! -d /opt/tomcat ]; then
    echo "ERROR: Tomcat not installed"
    exit 1
fi
echo "✓ Tomcat installed"

if [ ! -d /opt/opengrok ]; then
    echo "ERROR: OpenGrok not installed"
    exit 1
fi
echo "✓ OpenGrok installed"

# Check OpenGrok is running
echo "Waiting for OpenGrok to start..."
sleep 10

max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:8080/source > /dev/null; then
        echo "✓ OpenGrok is accessible"
        break
    fi
    attempt=$((attempt + 1))
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "ERROR: OpenGrok failed to start"
    sudo journalctl -u tomcat -n 50 --no-pager || true
    exit 1
fi

# Test search functionality
echo "Testing search..."
if curl -s "http://localhost:8080/source/search?q=hello&defs=&refs=&path=&hist=&type=" | grep -q "hello.c"; then
    echo "✓ Search works"
else
    echo "ERROR: Search failed"
    exit 1
fi

echo ""
echo "=== All Tests Passed ==="
echo "OpenGrok is running at http://localhost:8080/source"
