# OpenGrok Navigator Build System
# Builds VS Code extension, Chrome extension, and og CLI tool

.PHONY: all clean build-vscode build-chrome build-og build-og-annotate build-og-annotate-all dist-og dist-og-annotate dist-scripts test-og test-og-annotate test-chrome source dist dev help

# Go build flags for minimal binary size
# -s: disable symbol table
# -w: disable DWARF generation
GO_LDFLAGS := -ldflags="-s -w"

# Default target
all: dist

help:
	@echo "OpenGrok Navigator Build System"
	@echo ""
	@echo "Targets:"
	@echo "  all               - Build everything and create single distribution zip (default)"
	@echo "  build-vscode      - Build VS Code extension (.vsix)"
	@echo "  build-chrome      - Package Chrome extension (.zip)"
	@echo "  build-og          - Build og CLI tool (requires Go)"
	@echo "  dist-og           - Package og CLI as zip (source + binary)"
	@echo "  dist-scripts      - Package VM setup scripts as zip"
	@echo "  test-og           - Run og CLI unit tests"
	@echo "  test-chrome       - Run Chrome extension E2E tests (headless)"
	@echo "  build-og-annotate - Build og_annotate native host (current platform)"
	@echo "  build-og-annotate-all - Cross-compile og_annotate for all platforms"
	@echo "  test-og-annotate  - Run og_annotate unit tests"
	@echo "  dist-og-annotate  - Package og_annotate with pre-built binaries for all platforms"
	@echo "  source            - Create source-only package (without .git, node_modules, etc.)"
	@echo "  dist              - Build all and create single distribution zip with built extensions"
	@echo "  clean             - Remove all build artifacts"
	@echo "  dev               - Quick development build (no clean)"
	@echo ""

# Clean all build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf dist/
	rm -rf vscode-extension/out/
	rm -rf vscode-extension/*.vsix
	rm -rf chrome-extension/*.zip
	rm -f og/og og/og-* og/*.zip
	rm -f og_annotate/og_annotate og_annotate/og_annotate-* og_annotate/og_annotate.exe og_annotate/*.zip
	rm -rf og_annotate/bin/
	rm -rf scripts/*.zip
	@echo "Clean complete"

# Build VS Code extension
build-vscode:
	@echo "Building VS Code extension..."
	cd vscode-extension && npm install
	cd vscode-extension && npm run compile
	cd vscode-extension && npx vsce package --no-git-tag-version
	@echo "VS Code extension built successfully"

# Package Chrome extension
build-chrome:
	@echo "Packaging Chrome extension..."
	@mkdir -p chrome-extension/dist
	cd chrome-extension && zip -r opengrok-navigator-chrome.zip \
		manifest.json \
		background.js \
		content.js \
		content.css \
		debug.js \
		annotations.js \
		annotations.css \
		dark-mode-init.js \
		dark-theme.css \
		options.html \
		options.js \
		icons/*.png \
		README.md \
		TESTING.md \
		-x "*.zip" "dist/*" ".DS_Store" "tests/*"
	@echo "Chrome extension packaged successfully"

# Build og CLI tool
build-og:
	@echo "Building og CLI tool..."
	cd og && go build -o og .
	@echo "og CLI built successfully"

# Package og CLI as zip (source + binary)
dist-og: build-og
	@echo "Packaging og CLI..."
	cd og && zip -r og-cli.zip \
		*.go \
		go.mod \
		go.sum \
		README.md \
		og \
		-x "*_test.go"
	@echo "og CLI packaged successfully"

# Package VM setup scripts as zip
dist-scripts:
	@echo "Packaging VM setup scripts..."
	cd scripts && zip -r opengrok-scripts.zip \
		install-opengrok.sh \
		download-dependencies.sh \
		README.md \
		QUICKSTART.txt
	@echo "VM setup scripts packaged successfully"

# Run og CLI tests
test-og:
	@echo "Running og CLI tests..."
	cd og && go test -v -timeout 30s ./...
	@echo "og CLI tests passed"

# Build og_annotate native messaging host (current platform only)
build-og-annotate:
	@echo "Building og_annotate native host..."
	cd og_annotate && go build $(GO_LDFLAGS) -o og_annotate .
	@echo "og_annotate built successfully"

# Cross-compile og_annotate for all platforms
build-og-annotate-all:
	@echo "Cross-compiling og_annotate for all platforms..."
	@mkdir -p og_annotate/bin
	@echo "  Building for Linux AMD64..."
	cd og_annotate && GOOS=linux GOARCH=amd64 go build $(GO_LDFLAGS) -o bin/og_annotate-linux-amd64 .
	@echo "  Building for Linux ARM64..."
	cd og_annotate && GOOS=linux GOARCH=arm64 go build $(GO_LDFLAGS) -o bin/og_annotate-linux-arm64 .
	@echo "  Building for macOS AMD64..."
	cd og_annotate && GOOS=darwin GOARCH=amd64 go build $(GO_LDFLAGS) -o bin/og_annotate-darwin-amd64 .
	@echo "  Building for macOS ARM64..."
	cd og_annotate && GOOS=darwin GOARCH=arm64 go build $(GO_LDFLAGS) -o bin/og_annotate-darwin-arm64 .
	@echo "  Building for Windows AMD64..."
	cd og_annotate && GOOS=windows GOARCH=amd64 go build $(GO_LDFLAGS) -o bin/og_annotate-windows-amd64.exe .
	@echo "  Building for Windows ARM64..."
	cd og_annotate && GOOS=windows GOARCH=arm64 go build $(GO_LDFLAGS) -o bin/og_annotate-windows-arm64.exe .
	@echo "All platforms built successfully"
	@echo "Binary sizes:"
	@ls -lh og_annotate/bin/

# Package og_annotate with pre-built binaries for all platforms
dist-og-annotate: build-og-annotate-all
	@echo "Packaging og_annotate..."
	cd og_annotate && zip -r og_annotate.zip \
		README.md \
		install.sh \
		install.bat \
		install.ps1 \
		bin/
	@echo "og_annotate packaged successfully"

# Run og_annotate tests
test-og-annotate:
	@echo "Running og_annotate tests..."
	cd og_annotate && go test -v -timeout 30s ./...
	@echo "og_annotate tests passed"

# Create source distribution package
source:
	@echo "Creating source package..."
	@mkdir -p dist
	@VERSION=$$(grep '"version"' vscode-extension/package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/') && \
	zip -r dist/opengrok-navigator-source-v$$VERSION.zip \
		. \
		-x "*.git*" \
		-x "*node_modules/*" \
		-x "*/out/*" \
		-x "*.vsix" \
		-x "*.zip" \
		-x "*/dist/*" \
		-x "*/.DS_Store" \
		-x "*.log"
	@echo "Source package created in dist/"

# Build everything and create distribution
dist: clean build-vscode build-chrome dist-og dist-og-annotate dist-scripts
	@echo "Creating distribution package..."
	@mkdir -p dist/package/docs
	@VERSION=$$(grep '"version"' vscode-extension/package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/') && \
	cp vscode-extension/*.vsix dist/package/ 2>/dev/null && \
	cp chrome-extension/opengrok-navigator-chrome.zip dist/package/ 2>/dev/null && \
	cp og/og-cli.zip dist/package/ 2>/dev/null && \
	cp og_annotate/og_annotate.zip dist/package/ 2>/dev/null && \
	cp scripts/opengrok-scripts.zip dist/package/ 2>/dev/null && \
	cp README.md dist/package/ && \
	cp LICENSE dist/package/ && \
	cp BUILD.md dist/package/ && \
	cp CHANGELOG.md dist/package/ && \
	cp docs/*.md dist/package/docs/ 2>/dev/null && \
	echo "# OpenGrok Navigator v$$VERSION" > dist/package/VERSION.txt && \
	echo "" >> dist/package/VERSION.txt && \
	echo "Contents:" >> dist/package/VERSION.txt && \
	echo "- opengrok-navigator-*.vsix - VS Code extension" >> dist/package/VERSION.txt && \
	echo "- opengrok-navigator-chrome.zip - Chrome extension (with annotations)" >> dist/package/VERSION.txt && \
	echo "- og-cli.zip - OpenGrok CLI tool (source + binary)" >> dist/package/VERSION.txt && \
	echo "- og_annotate.zip - Annotation native messaging host" >> dist/package/VERSION.txt && \
	echo "- opengrok-scripts.zip - VM setup scripts for OpenGrok server" >> dist/package/VERSION.txt && \
	echo "- docs/ - Feature documentation and design docs" >> dist/package/VERSION.txt && \
	echo "- README.md - User documentation" >> dist/package/VERSION.txt && \
	echo "- BUILD.md - Build instructions" >> dist/package/VERSION.txt && \
	echo "- CHANGELOG.md - Version history" >> dist/package/VERSION.txt && \
	echo "- LICENSE - MIT license" >> dist/package/VERSION.txt && \
	cd dist && zip -r opengrok-navigator-v$$VERSION.zip package/ && \
	rm -rf package/
	@echo ""
	@echo "=========================================="
	@echo "Build complete! Distribution package:"
	@echo "=========================================="
	@ls -lh dist/
	@echo "=========================================="

# Quick build for development (no clean)
dev: build-vscode build-chrome build-og build-og-annotate
	@echo "Development build complete"

# Run Chrome extension E2E tests (headless)
test-chrome:
	@echo "Running Chrome extension E2E tests..."
	cd chrome-extension && npm install
	cd chrome-extension && npx playwright install chromium
	cd chrome-extension && npm test
	@echo "Chrome extension tests passed"

# Run all tests
test: test-og test-og-annotate
	@echo "All Go tests passed"
	@echo "Note: Run 'make test-chrome' separately for Chrome E2E tests"
