#!/bin/bash
# build.sh - Standardized build process for og project
# Runs all quality checks, tests, and metrics

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Handle install command
if [ "${1:-}" = "install" ]; then
    GOBIN="$(go env GOPATH)/bin"
    echo "Installing og to $GOBIN..."
    go install .

    # Verify installation
    if [ -x "$GOBIN/og" ]; then
        echo "✓ Successfully installed og to $GOBIN/og"

        # Check if GOBIN is in PATH (use word boundaries to avoid false positives)
        if echo ":$PATH:" | grep -q ":$GOBIN:"; then
            echo "✓ $GOBIN is in your PATH"
        else
            echo "⚠ Warning: $GOBIN is not in your PATH"
            echo "  Add it to your PATH by adding this to your ~/.bashrc or ~/.zshrc:"
            echo "  export PATH=\"\$PATH:$GOBIN\""
        fi
    else
        echo "✗ Installation failed: binary not found at $GOBIN/og"
        exit 1
    fi
    exit 0
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "og Build Process"
echo "=========================================="

# Step 1: Format check
echo -e "\n${YELLOW}[1/6] Checking code formatting...${NC}"
if gofmt -l . | grep -q .; then
    echo -e "${RED}FAIL: The following files need formatting:${NC}"
    gofmt -l .
    exit 1
fi
echo -e "${GREEN}PASS: All files properly formatted${NC}"

# Step 2: Vet
echo -e "\n${YELLOW}[2/6] Running go vet...${NC}"
go vet ./...
echo -e "${GREEN}PASS: go vet${NC}"

# Step 3: Staticcheck
echo -e "\n${YELLOW}[3/6] Running staticcheck...${NC}"
STATICCHECK="$(go env GOPATH)/bin/staticcheck"
if [ ! -x "$STATICCHECK" ]; then
    echo "Installing staticcheck..."
    go install honnef.co/go/tools/cmd/staticcheck@latest
fi
"$STATICCHECK" ./...
echo -e "${GREEN}PASS: staticcheck${NC}"

# Step 4: Build
echo -e "\n${YELLOW}[4/6] Building...${NC}"
go build -o og .
echo -e "${GREEN}PASS: Build successful${NC}"

# Step 5: Unit Tests
echo -e "\n${YELLOW}[5/6] Running unit tests...${NC}"
go test -v -timeout 30s ./...
echo -e "${GREEN}PASS: Unit tests${NC}"

# Step 6: Code Metrics (scc)
echo -e "\n${YELLOW}[6/6] Code metrics (scc)...${NC}"
if command -v scc &> /dev/null; then
    scc --include-ext go
else
    echo -e "${YELLOW}SKIP: scc not installed (optional)${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}BUILD SUCCESSFUL${NC}"
echo "=========================================="
