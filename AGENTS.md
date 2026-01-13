# OpenGrok Navigator - Agent Instructions

> **Note**: This file was renamed from `CLAUDE.md` to `AGENTS.md` to support multiple AI agents.

Bidirectional VS Code ↔ OpenGrok integration via extensions and CLI tool.

**Current Version:** v1.5.0

**Documentation**: See [docs/](docs/) for architecture, build instructions, and design documents.

## Components

### VS Code Extension (`vscode-extension/`)
- Open current line in OpenGrok, copy URLs, search & display results in sidebar
- Key files: [src/extension.ts](vscode-extension/src/extension.ts), [package.json](vscode-extension/package.json)

### Chrome Extension (`chrome-extension/`)
- Ctrl+Click line numbers to open in VS Code via `vscode://` protocol
- Floating button, context menu, keyboard shortcuts
- **Inline annotations** for source code (new in v1.4.0)
- Key files: [content.js](chrome-extension/content.js), [background.js](chrome-extension/background.js), [annotations.js](chrome-extension/annotations.js)

### og CLI Tool (`og/`)
- Command-line OpenGrok search client written in Go
- Search types: full, def, symbol, path, hist
- Call graph tracing with `trace` command
- Key files: [main.go](og/main.go), [client.go](og/client.go), [trace.go](og/trace.go)

### og_annotate Native Host (`og_annotate/`)
- Native messaging host for Chrome annotation storage
- Reads/writes markdown annotation files to local/network drives
- Key files: [main.go](og_annotate/main.go), [annotations.go](og_annotate/annotations.go)

## Architecture

**Core Components** ([extension.ts](vscode-extension/src/extension.ts)):
1. TreeView (lines 17-99): `SearchResultLine`, `SearchResultFile`, `SearchResultsProvider`
2. API Integration (126-184): `searchOpenGrokAPI()` - tries REST API v1 `/api/v1/search`, falls back to HTML
3. JSON Parsing (186-271): `parseOpenGrokJSON()` for REST API responses
4. HTML Parsing (273-432): `parseOpenGrokResults()` fallback - extracts context from `<a>` tags
5. Commands (500-742): `openInOpenGrok`, `copyOpenGrokUrl`, `searchInView`, etc.

**URL Format**: `{baseUrl}/xref/{projectName}/{relativePath}#{lineNumber}`
- Normal mode: uses workspace folder name
- `useTopLevelFolder` mode: uses first path component

**Settings**:
- `baseUrl` (default: `http://localhost:8080/source`)
- `projectRoot`, `useIntegratedBrowser`, `useTopLevelFolder`
- `authEnabled`, `authUsername` (password in SecretStorage)

**Keybindings**: `Ctrl+Shift+G` prefix ("G" for Grok)
- O: Open, C: Copy URL, S: Search (browser), V: Search (VS Code), A: Search all projects

## Key Implementation Details

**HTML Parsing**: `/<a[^>]*>.*?<\/span>\s*(.+?)<\/a>/s` extracts code after line number span

**Search Term Highlighting**: Uses `TreeItemLabel.highlights` for yellow highlighting

**Path Mapping**: Extracts `/xref/{project}/path` → local workspace path

**Authentication**: HTTP Basic Auth via VS Code SecretStorage, applied to both REST/HTML

**REST API Migration**: Prefers REST API v1 (clean JSON), falls back to HTML for older OpenGrok

## Annotations Feature

**Architecture**: Chrome extension ↔ background.js ↔ og_annotate (native host) ↔ filesystem

**Storage Format**: Markdown files with double-underscore path encoding
- `project__src__file.java.md` for `project/src/file.java`
- Escape `__` in names as `___`

**Key Components**:
- `annotations.js`: AnnotationManager class, UI rendering, polling
- `annotations.css`: Margin note style with yellow accent
- `og_annotate/`: Go native host for file I/O

**Settings** (Options page):
- Storage path (local: `chrome.storage.local`)
- Author name, poll interval (synced: `chrome.storage.sync`)

**Keyboard Shortcuts** (Chrome extension):
- `t`: Quick file finder
- `c`: Create annotation (requires hovering over a line number)
- `x`: Jump to next annotation (wraps around)

## Native Messaging Linkage (CRITICAL)

**IMPORTANT**: The Chrome extension ↔ og_annotate link requires exact name matching across multiple files.

**Message Flow**:
1. `annotations.js` → `chrome.runtime.sendMessage()` → `background.js`
2. `background.js` → `chrome.runtime.sendNativeMessage('og_annotate', ...)` → og_annotate binary
3. og_annotate binary → stdio response → back through the chain

**Critical Link Points**:

| Component | File | Key Value |
|-----------|------|-----------|
| Host name constant | [background.js:20](chrome-extension/background.js#L20) | `const NATIVE_HOST = 'og_annotate'` |
| Permission | [manifest.json:10](chrome-extension/manifest.json#L10) | `"nativeMessaging"` |
| Manifest name | install.sh / install.ps1 | `"name": "og_annotate"` |
| Binary protocol | [main.go](og_annotate/main.go) | 4-byte little-endian length + JSON |

**Action Mapping** (prefix stripped by background.js):

| Chrome Action | og_annotate Handler |
|--------------|-------------------|
| `annotation:ping` | `ping` |
| `annotation:read` | `read` |
| `annotation:save` | `save` |
| `annotation:delete` | `delete` |
| `annotation:startEditing` | `startEditing` |
| `annotation:stopEditing` | `stopEditing` |
| `annotation:getEditing` | `getEditing` |

**Native Messaging Manifest** (created by installers):
- macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/og_annotate.json`
- Linux: `~/.config/google-chrome/NativeMessagingHosts/og_annotate.json`
- Windows: Registry `HKCU:\Software\Google\Chrome\NativeMessagingHosts\og_annotate` → manifest file

**Manifest Format**:
```json
{
  "name": "og_annotate",
  "path": "/path/to/og_annotate",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://EXTENSION_ID/"]
}
```

**When modifying**: If you change the host name, you MUST update: `NATIVE_HOST` constant, installer manifest generation, and og_annotate binary name expectations.

## Development Workflow

Before committing, always run:
```bash
./build.sh check
```

This runs gofmt, staticcheck, Go tests, and builds all components.

## Build Commands

```bash
./build.sh build              # Build all components
./build.sh build-vscode       # Build VS Code extension (.vsix)
./build.sh build-chrome       # Package Chrome extension (.zip)
./build.sh build-og           # Build og CLI tool
./build.sh build-og-annotate  # Build og_annotate native host
./build.sh dev                # Quick development build (no clean)
./build.sh dist               # Run check and create distribution zip
./build.sh test               # Run all Go tests
./build.sh test-chrome        # Run Chrome extension E2E tests
./build.sh test-all           # Run all tests including Chrome E2E
./build.sh lint               # Format and lint Go code
./build.sh check              # Full pre-commit check (lint + test + build)
./build.sh clean              # Remove all build artifacts
./build.sh deploy-local       # Run dist and install from package
./build.sh deploy-local --skip-tests  # Fast deploy without tests
./build.sh prepare-release    # Run all checks and show changes
./build.sh release X.Y.Z      # Create release commit and tag
```

## Installation

**Unified Installers** (in dist archive and repo root):
- `install.sh` - macOS/Linux installer
- `install.ps1` - Windows PowerShell installer
- `install.bat` - Windows double-click wrapper

**What they install**:
1. VS Code extension via `code --install-extension` (falls back to manual instructions)
2. Chrome extension extracted to `~/.opengrok-navigator/chrome-extension/` (requires manual load)
3. og_annotate native host with auto-detected extension ID

**Usage**:
```bash
# From dist archive or repo root
./install.sh          # macOS/Linux
.\install.ps1         # Windows PowerShell
install.bat           # Windows (double-click)

# Local development
./build.sh deploy-local     # Build and install locally
```

**Install locations**:
- Chrome extension: `~/.opengrok-navigator/chrome-extension/` (Unix) or `%LOCALAPPDATA%\opengrok-navigator\` (Windows)
- og_annotate binary: `~/.local/bin/og_annotate` (Unix) or `%LOCALAPPDATA%\og_annotate\` (Windows)

## Test Maintenance

**IMPORTANT**: When making design changes to the Chrome extension, the E2E tests MUST be updated.

**Chrome Extension Tests** (`chrome-extension/tests/e2e/`):
- `ui-injection.spec.ts`: Tests toolbar, buttons, file finder modal
- `navigation.spec.ts`: Tests Ctrl+click, keyboard shortcuts
- `annotations.spec.ts`: Tests annotation toggle, create, delete

**Test Dependencies** (update tests when modifying):
| File Changed | Tests to Update |
|--------------|-----------------|
| `content.js` | `ui-injection.spec.ts`, `navigation.spec.ts` |
| `annotations.js` | `annotations.spec.ts` |
| `content.css` | `ui-injection.spec.ts` (if class names change) |
| `manifest.json` | All tests (if content script patterns change) |

**Running Tests**:
```bash
cd chrome-extension
npm install                    # First time only
npx playwright install chromium # First time only
npm test                       # Run all tests (headless) - ALWAYS USE THIS
npm run test:headed           # Run with visible browser (debugging only)
npm run test:ui               # Debug with Playwright UI (debugging only)
```

**IMPORTANT**: Always run `npm test` (headless mode) to verify tests pass. Never skip running tests after changes.

## OpenGrok Installer Scripts (`scripts/`)

**Target Platform**: Ubuntu 20.04+ (also works on RHEL/CentOS with iptables)

**Key files**:
- [install-opengrok.sh](scripts/install-opengrok.sh) - Offline installer
- [download-dependencies.sh](scripts/download-dependencies.sh) - Downloads required tarballs

**Port 80 Support**: Uses iptables NAT rules to redirect privileged ports (< 1024) to Tomcat on 8080. Requires `iptables` package; for persistence install `iptables-persistent` (Ubuntu) or `iptables-services` (RHEL).

## Hints

* Claude is extremely concise when reporting progress and summarising changes (don't include line numbers or precise files)
* All design docs should go into the `docs` folder

## Agent Workflows

### What's Next

When asked "what's next" or similar, run this workflow to provide a concise project status summary:

**1. Run Status Command**
```bash
./build.sh status
```
This provides working copy state, remote sync, CI status, releases, and recent commits.

**2. Review Plan**
Read `docs/PLAN.md` and compare against the status output:
- Current phase completion vs what's been released
- Next planned milestone or backlog items ready to start
- Any blockers or dependencies

**3. Summary Report**
Combine the status output with plan review to provide:
- Current state (working copy, CI health, version)
- Plan progress (what phase we're in, what's next)
- **Suggested next step**: one clear recommendation

Keep the report brief (10-15 lines max). Focus on actionable information.