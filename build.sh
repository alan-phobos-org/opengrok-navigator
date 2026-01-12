#!/bin/bash
set -euo pipefail

# Get version from package.json
get_version() {
    grep '"version"' vscode-extension/package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/'
}

case "${1:-help}" in
    clean)
        echo "Cleaning build artifacts..."
        rm -rf dist/
        rm -rf vscode-extension/out/
        rm -rf vscode-extension/*.vsix
        rm -rf chrome-extension/*.zip
        rm -f og/og og/og-* og/*.zip
        rm -f og_annotate/og_annotate og_annotate/og_annotate-* og_annotate/og_annotate.exe og_annotate/*.zip
        rm -rf og_annotate/bin/
        rm -rf scripts/*.zip
        echo "Clean complete"
        ;;
    build-vscode)
        echo "Building VS Code extension..."
        (cd vscode-extension && npm install)
        (cd vscode-extension && npm run compile)
        (cd vscode-extension && npx vsce package --no-git-tag-version)
        echo "VS Code extension built successfully"
        ;;
    build-chrome)
        echo "Packaging Chrome extension..."
        mkdir -p chrome-extension/dist
        (cd chrome-extension && zip -r opengrok-navigator-chrome.zip \
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
            -x "*.zip" "dist/*" ".DS_Store" "tests/*")
        echo "Chrome extension packaged successfully"
        ;;
    build-og)
        echo "Building og CLI tool..."
        (cd og && go build -o og .)
        echo "og CLI built successfully"
        ;;
    build-og-annotate)
        echo "Building og_annotate native host..."
        (cd og_annotate && go build -ldflags="-s -w" -o og_annotate .)
        echo "og_annotate built successfully"
        ;;
    build-og-annotate-all)
        echo "Cross-compiling og_annotate for all platforms..."
        mkdir -p og_annotate/bin
        echo "  Building for Linux AMD64..."
        (cd og_annotate && GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/og_annotate-linux-amd64 .)
        echo "  Building for Linux ARM64..."
        (cd og_annotate && GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o bin/og_annotate-linux-arm64 .)
        echo "  Building for macOS AMD64..."
        (cd og_annotate && GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o bin/og_annotate-darwin-amd64 .)
        echo "  Building for macOS ARM64..."
        (cd og_annotate && GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o bin/og_annotate-darwin-arm64 .)
        echo "  Building for Windows AMD64..."
        (cd og_annotate && GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o bin/og_annotate-windows-amd64.exe .)
        echo "  Building for Windows ARM64..."
        (cd og_annotate && GOOS=windows GOARCH=arm64 go build -ldflags="-s -w" -o bin/og_annotate-windows-arm64.exe .)
        echo "All platforms built successfully"
        echo "Binary sizes:"
        ls -lh og_annotate/bin/
        ;;
    build)
        # Build all components
        $0 build-vscode
        $0 build-chrome
        $0 build-og
        $0 build-og-annotate
        echo "All components built"
        ;;
    dist-og)
        $0 build-og
        echo "Packaging og CLI..."
        (cd og && zip -r og-cli.zip \
            *.go \
            go.mod \
            go.sum \
            README.md \
            og \
            -x "*_test.go")
        echo "og CLI packaged successfully"
        ;;
    dist-og-annotate)
        $0 build-og-annotate-all
        echo "Packaging og_annotate..."
        (cd og_annotate && zip -r og_annotate.zip \
            README.md \
            install.sh \
            install.bat \
            install.ps1 \
            bin/)
        echo "og_annotate packaged successfully"
        ;;
    dist-scripts)
        echo "Packaging VM setup scripts..."
        (cd scripts && zip -r opengrok-scripts.zip \
            install-opengrok.sh \
            download-dependencies.sh \
            README.md \
            QUICKSTART.txt)
        echo "VM setup scripts packaged successfully"
        ;;
    dist)
        $0 clean
        $0 check
        $0 test-chrome
        $0 dist-og
        $0 dist-og-annotate
        $0 dist-scripts
        echo "Creating distribution package..."
        mkdir -p dist/package/docs
        VERSION=$(get_version)
        cp vscode-extension/*.vsix dist/package/ 2>/dev/null || true
        cp chrome-extension/opengrok-navigator-chrome.zip dist/package/ 2>/dev/null || true
        cp og/og-cli.zip dist/package/ 2>/dev/null || true
        cp og_annotate/og_annotate.zip dist/package/ 2>/dev/null || true
        cp scripts/opengrok-scripts.zip dist/package/ 2>/dev/null || true
        cp install.sh dist/package/
        cp install.ps1 dist/package/
        cp install.bat dist/package/
        cp README.md dist/package/
        cp LICENSE dist/package/
        cp CHANGELOG.md dist/package/
        cp docs/*.md dist/package/docs/ 2>/dev/null || true
        cat > dist/package/VERSION.txt <<EOF
# OpenGrok Navigator v$VERSION

Contents:
- opengrok-navigator-*.vsix - VS Code extension
- opengrok-navigator-chrome.zip - Chrome extension (with annotations)
- og-cli.zip - OpenGrok CLI tool (source + binary)
- og_annotate.zip - Annotation native messaging host
- opengrok-scripts.zip - VM setup scripts for OpenGrok server
- install.sh - Unified installer for macOS/Linux
- install.ps1/bat - Unified installer for Windows
- docs/ - Documentation (BUILD.md, QUICKSTART.md, design docs)
- README.md - User documentation
- CHANGELOG.md - Version history
- LICENSE - MIT license
EOF
        (cd dist && zip -r "opengrok-navigator-v$VERSION.zip" package/)
        rm -rf dist/package/
        echo ""
        echo "=========================================="
        echo "Build complete! Distribution package:"
        echo "=========================================="
        ls -lh dist/
        echo "=========================================="
        ;;
    source)
        echo "Creating source package..."
        mkdir -p dist
        VERSION=$(get_version)
        zip -r "dist/opengrok-navigator-source-v$VERSION.zip" \
            . \
            -x "*.git*" \
            -x "*node_modules/*" \
            -x "*/out/*" \
            -x "*.vsix" \
            -x "*.zip" \
            -x "*/dist/*" \
            -x "*/.DS_Store" \
            -x "*.log"
        echo "Source package created in dist/"
        ;;
    test-og)
        echo "Running og CLI tests..."
        (cd og && go test -v -timeout 30s ./...)
        echo "og CLI tests passed"
        ;;
    test-og-annotate)
        echo "Running og_annotate tests..."
        (cd og_annotate && go test -v -timeout 30s ./...)
        echo "og_annotate tests passed"
        ;;
    test-chrome)
        echo "Running Chrome extension E2E tests..."
        (cd chrome-extension && npm install)
        (cd chrome-extension && npx playwright install chromium)
        (cd chrome-extension && npm test)
        echo "Chrome extension tests passed"
        ;;
    test)
        # Run all Go tests
        $0 test-og
        $0 test-og-annotate
        echo "All Go tests passed"
        echo "Note: Run './build.sh test-chrome' separately for Chrome E2E tests"
        ;;
    test-all)
        $0 test
        $0 test-chrome
        echo "All tests passed"
        ;;
    lint)
        echo "Running linters..."
        (cd og && gofmt -l -w .)
        (cd og_annotate && gofmt -l -w .)
        if command -v staticcheck >/dev/null 2>&1; then
            (cd og && staticcheck ./...)
            (cd og_annotate && staticcheck ./...)
        else
            echo "staticcheck not installed, skipping"
        fi
        ;;
    check)
        # Full pre-commit check: lint, test, build
        $0 lint
        $0 test
        $0 build
        ;;
    dev)
        # Quick development build (no clean)
        $0 build-vscode
        $0 build-chrome
        $0 build-og
        $0 build-og-annotate
        echo "Development build complete"
        ;;
    deploy-local)
        if [ "${2:-}" = "--skip-tests" ]; then
            echo "Skipping tests for rapid deployment..."
            $0 clean
            $0 build
            $0 dist-og
            $0 dist-og-annotate
        else
            $0 dist
        fi
        echo ""
        echo "Running unified installer from dist package..."
        echo ""
        VERSION=$(get_version)
        DIST_ZIP="dist/opengrok-navigator-v$VERSION.zip"
        DEPLOY_DIR="dist/deploy-local"
        rm -rf "$DEPLOY_DIR"
        mkdir -p "$DEPLOY_DIR"
        # Create package structure directly if skipping tests
        if [ "${2:-}" = "--skip-tests" ]; then
            mkdir -p "$DEPLOY_DIR/package"
            cp vscode-extension/*.vsix "$DEPLOY_DIR/package/" 2>/dev/null || true
            cp chrome-extension/opengrok-navigator-chrome.zip "$DEPLOY_DIR/package/" 2>/dev/null || true
            cp og/og-cli.zip "$DEPLOY_DIR/package/" 2>/dev/null || true
            cp og_annotate/og_annotate.zip "$DEPLOY_DIR/package/" 2>/dev/null || true
            cp install.sh "$DEPLOY_DIR/package/"
        else
            unzip -q "$DIST_ZIP" -d "$DEPLOY_DIR"
        fi
        (cd "$DEPLOY_DIR/package" && ./install.sh)
        rm -rf "$DEPLOY_DIR"
        echo ""
        echo "Local deployment complete"
        ;;
    prepare-release)
        echo "=== Preparing release ==="
        echo ""

        echo "Step 1/3: Running pre-commit checks..."
        $0 check
        echo "✓ Pre-commit checks passed"
        echo ""

        echo "Step 2/3: Running all tests..."
        $0 test-all
        echo "✓ All tests passed"
        echo ""

        echo "Step 3/3: Changes since last release..."
        echo ""
        LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
        if [ -n "$LAST_TAG" ]; then
            echo "Last release: $LAST_TAG"
            echo ""
            echo "Commits since $LAST_TAG:"
            git log --oneline "$LAST_TAG"..HEAD
            echo ""
            echo "Files changed:"
            git diff --stat "$LAST_TAG"..HEAD | tail -1
        else
            echo "No previous release tag found"
            echo ""
            echo "All commits:"
            git log --oneline
        fi

        echo ""
        echo "=== Release preparation complete ==="
        echo ""
        echo "Next steps:"
        echo "  1. Review the changes above"
        echo "  2. Update CHANGELOG.md with release notes"
        echo "  3. Run: ./build.sh release <version>"
        echo ""
        echo "Example: ./build.sh release 1.5.0"
        ;;
    release)
        RELEASE_VERSION="${2:-}"

        if [ -z "$RELEASE_VERSION" ]; then
            echo "Usage: $0 release <version>"
            echo "Example: $0 release 1.5.0"
            exit 1
        fi

        # Validate version format (semver)
        if ! echo "$RELEASE_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
            echo "ERROR: Invalid version format. Use semantic versioning (e.g., 1.2.3)"
            exit 1
        fi

        TAG="v$RELEASE_VERSION"

        # Check if tag already exists
        if git rev-parse "$TAG" >/dev/null 2>&1; then
            echo "ERROR: Tag $TAG already exists"
            exit 1
        fi

        # Check for uncommitted changes (excluding CHANGELOG.md)
        if ! git diff --quiet HEAD -- . ':!CHANGELOG.md'; then
            echo "ERROR: Uncommitted changes exist (other than CHANGELOG.md)"
            echo "Please commit or stash changes before releasing"
            git status --short
            exit 1
        fi

        # Check that CHANGELOG.md has an entry for this version
        if ! grep -q "## \[$RELEASE_VERSION\]" CHANGELOG.md; then
            echo "ERROR: CHANGELOG.md does not contain entry for version $RELEASE_VERSION"
            echo "Please add a '## [$RELEASE_VERSION]' section to CHANGELOG.md"
            exit 1
        fi

        # Check if CHANGELOG.md is modified
        if git diff --quiet HEAD -- CHANGELOG.md; then
            echo "WARNING: CHANGELOG.md has no uncommitted changes"
            echo "Did you forget to update the changelog?"
            read -p "Continue anyway? [y/N] " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi

        echo "Creating release $TAG..."

        # Stage and commit CHANGELOG.md if modified
        if ! git diff --quiet HEAD -- CHANGELOG.md; then
            git add CHANGELOG.md
        fi

        # Update version in package.json
        (cd vscode-extension && npm version "$RELEASE_VERSION" --no-git-tag-version)
        git add vscode-extension/package.json

        # Create release commit (if there are staged changes)
        if ! git diff --cached --quiet; then
            git commit -m "Release $TAG"
            echo "✓ Created release commit"
        else
            echo "No changes to commit"
        fi

        # Create annotated tag
        git tag -a "$TAG" -m "Release $TAG"
        echo "✓ Created tag $TAG"

        echo ""
        echo "=== Release $TAG created ==="
        echo ""
        echo "Next steps:"
        echo "  1. Review: git log -1 && git show $TAG"
        echo "  2. Push:   git push origin main $TAG"
        ;;
    *)
        echo "OpenGrok Navigator Build System"
        echo ""
        echo "Usage: $0 <command>"
        echo ""
        echo "Build Commands:"
        echo "  build              Build all components (VS Code, Chrome, og, og_annotate)"
        echo "  build-vscode       Build VS Code extension (.vsix)"
        echo "  build-chrome       Package Chrome extension (.zip)"
        echo "  build-og           Build og CLI tool"
        echo "  build-og-annotate  Build og_annotate native host (current platform)"
        echo "  build-og-annotate-all  Cross-compile og_annotate for all platforms"
        echo "  dev                Quick development build (no clean)"
        echo ""
        echo "Distribution Commands:"
        echo "  dist               Run check and create distribution zip"
        echo "  dist-og            Package og CLI as zip"
        echo "  dist-og-annotate   Package og_annotate with all platform binaries"
        echo "  dist-scripts       Package VM setup scripts"
        echo "  source             Create source-only package"
        echo ""
        echo "Test Commands:"
        echo "  test               Run all Go tests"
        echo "  test-og            Run og CLI tests"
        echo "  test-og-annotate   Run og_annotate tests"
        echo "  test-chrome        Run Chrome extension E2E tests"
        echo "  test-all           Run all tests including Chrome E2E"
        echo ""
        echo "Quality Commands:"
        echo "  lint               Format and lint Go code"
        echo "  check              Full pre-commit check (lint + test + build)"
        echo ""
        echo "Deployment Commands:"
        echo "  deploy-local [--skip-tests]  Run dist and install from package"
        echo "  clean              Remove all build artifacts"
        echo ""
        echo "Release Commands:"
        echo "  prepare-release    Run all checks and show changes"
        echo "  release X.Y.Z      Create release commit and tag"
        ;;
esac
