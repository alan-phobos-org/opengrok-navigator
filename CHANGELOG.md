# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- VS Code extension: Fixed potential crash when workspaceFolders is an empty array

## [1.5.0] - 2026-01-12

### Added
- **CI/CD**: GitHub Actions workflow for automated testing and linting
- **Build System**: Cross-platform `build.sh` script replacing Makefile
  - Works on macOS, Linux, and Windows (Git Bash/WSL)
  - Same commands as before: `./build.sh build`, `./build.sh test`, `./build.sh dist`
- **Installers**: Unified installation scripts
  - `install.sh` for macOS/Linux
  - `install.ps1` for Windows PowerShell
  - `install.bat` for Windows double-click
  - Auto-detect Chrome extension ID for native messaging
- **Annotation Storage v2**: JSON schema-based annotation protocol
  - Request/response schemas in `og_annotate/schema/`
  - Improved validation and error handling
- **Testing**: Chrome extension E2E smoke tests against live OpenGrok
- **Testing**: VS Code extension test infrastructure

### Changed
- **og_annotate**: Migrated to v2 annotation storage format
- **Chrome Extension**: Improved native messaging error handling

### Fixed
- Security improvements across extensions
- Better error messages for native host communication failures

## [1.4.0] - 2026-01-08

### Added
- **Inline Annotations**: Chrome extension annotation feature for source code
  - Create, edit, and delete annotations on any line
  - Annotations stored as markdown files via native messaging host
  - Keyboard shortcuts: `c` to create, `x` to jump to next
  - Author tracking and timestamps
- **og_annotate**: Native messaging host for annotation file I/O
  - Reads/writes markdown annotation files to local/network drives
  - Path encoding with double-underscore scheme

## [1.3.0] - 2026-01-04

### Added
- **og CLI Tool**: New command-line OpenGrok search client written in Go
  - Search types: full, def, symbol, path, hist
  - Call graph tracing with `trace` command for exploring code relationships
  - Clickable web links with `--web-links` / `-w` option
  - Project listing and filtering
  - Configuration persistence with `og init`
  - See [og/README.md](og/README.md) for full documentation

- **VS Code Extension**: Configurable search settings
  - `searchTimeout` setting for slow servers (default 30s)
  - `contextLength` setting for result context display (default 300 chars)
  - Word-boundary aware context truncation

### Improved
- **VS Code Extension**: Better error handling for search requests
  - Specific error messages for connection refused, hostname not found, timeouts
  - Clear authentication failure messages (401 errors)
  - Server error handling (5xx errors)

- **OpenGrok Installer Scripts**: Major improvements to offline installation
  - Comprehensive testing with VM automation
  - Better error handling and progress reporting
  - Input validation fixes
  - Added test harness with Multipass VMs

## [1.2.0] - 2025-12-20

### Fixed
- **Chrome Extension**: Dark mode FOUC (Flash of Unstyled Content) completely resolved
  - Implemented early script injection at `document_start` for instant dark mode application
  - Added localStorage caching for synchronous theme detection
  - See [docs/DARK_MODE_REDESIGN.md](docs/DARK_MODE_REDESIGN.md) for technical details
- **VS Code Extension**: Click-through functionality for search results
  - Search results now properly open files in editor when clicked

## [1.1.0] - 2025-12-18

### Changed
- **Code Quality**: Removed console.log statements from production code for cleaner output
- **VS Code Extension**: Updated publisher and repository information in package.json
- **Documentation**: Updated FEATURE_SUGGESTIONS.md to reflect Quick File Finder as completed feature
- **Chrome Extension**: Updated troubleshooting documentation for file finder feature

### Added
- **.editorconfig**: Added EditorConfig file for consistent code formatting across editors
- **.eslintrc.json**: Added ESLint configuration for VS Code extension
- **Documentation**: Improved TODO.md with clear status and reference to feature suggestions

### Fixed
- Placeholder values in VS Code extension package.json (publisher, repository URL)
- Console logging in Chrome extension background script and content script
- Misleading "experimental" reference in Chrome extension troubleshooting section

## [1.0.0] - 2025-12-15

### Added
- **Build System**: Comprehensive Makefile for building both extensions with single command
  - `make` or `make dist` - Build everything and create a single distribution zip
  - `make build-vscode` - Build VS Code extension only
  - `make build-chrome` - Package Chrome extension only
  - `make clean` - Remove all build artifacts
  - `make source` - Create source-only distribution
  - `make dev` - Quick development build (no clean)
  - Automatic versioning from package.json
  - Creates single `opengrok-navigator-vX.Y.Z.zip` containing both extensions and documentation
  - Includes VERSION.txt file listing package contents

- **Quick File Finder** (Chrome Extension): Now a core feature (no longer experimental)
  - Server-side search using OpenGrok REST API `/api/v1/search?path=*query*`
  - Real-time search as you type (300ms debounce)
  - Dual-action results: Enter to open in OpenGrok, Shift+Enter to open in VS Code
  - Displays filename + directory path for each result
  - Works with any repository size (no pre-loading required)
  - Press `T` on any OpenGrok page to activate
  - Clear error messages for API unavailability or authentication issues

- **SSL Certificate Support**:
  - VS Code Extension: `opengrok-navigator.rejectUnauthorized` setting to disable certificate verification for self-signed certificates
  - Configuration option with clear warning about security implications

- **License and Build Files**:
  - LICENSE file (MIT)
  - .vscodeignore file for cleaner VS Code extension packaging
  - BUILD.md with comprehensive build instructions
  - Updated .gitignore for dist/ directory and build artifacts

### Changed
- **Chrome Extension Settings**: Reorganized settings page
  - Removed "Experimental Features" section
  - Added "Quick File Finder" section with usage instructions
  - Simplified settings UI

### Fixed
- **Chrome Extension**: Fixed duplicate project name in Quick File Finder URLs
  - API returns paths with project prefix, now properly stripped to avoid duplication
  - Example: Fixed `/xref/illumos-gate//illumos-gate/path` → `/xref/illumos-gate/path`

- **VS Code Extension**: Fixed warnings during build
  - Added LICENSE file to vscode-extension/ directory to suppress missing license warning
  - Added .vscodeignore file to suppress packaging warning
  - Cleaner build output with no warnings

### Removed
- **Chrome Extension**: Removed experimental feature flag for Quick File Finder
  - Feature is now always enabled
  - Removed experimentalFileFinder from storage
  - Removed conditional loading code

## Design Decisions

### Quick File Finder Redesign
See [docs/QUICK_FILE_FINDER_DESIGN.md](docs/QUICK_FILE_FINDER_DESIGN.md) for full design rationale.

**Key decisions:**
1. **Server-side search** instead of client-side filtering - Works with repos of any size
2. **Wildcard wrapping** (`*query*`) for intuitive substring matching
3. **No fallback to page scraping** - Clear error messages instead of unreliable behavior

### Build System Design
- Single command (`make`) to build everything
- Automatic version extraction from package.json
- Separate targets for development (`make dev`) and distribution (`make dist`)
- Clean separation of source, build artifacts, and distribution packages

## Migration Notes

### For Users
- The Quick File Finder is now always available (no need to enable experimental features)
- If you were using the experimental file finder, your experience is now improved with server-side search

### For Developers
- Run `make` to build both extensions
- Distribution packages are created in `dist/` directory
- See BUILD.md for detailed build instructions

[Unreleased]: https://github.com/alan-phobos-org/opengrok-navigator/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/alan-phobos-org/opengrok-navigator/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/alan-phobos-org/opengrok-navigator/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/alan-phobos-org/opengrok-navigator/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/alan-phobos-org/opengrok-navigator/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/alan-phobos-org/opengrok-navigator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/alan-phobos-org/opengrok-navigator/releases/tag/v1.0.0
