# OpenGrok Navigator - Dev Notes

Bidirectional VS Code ↔ OpenGrok integration via extensions and CLI tool.

**Current Version:** v1.4.0

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
- `c`: Create annotation at current line
- `x`: Jump to next annotation (wraps around)

## Build

**All**: `make dist` (builds everything and creates distribution zip)

**VS Code**: `make build-vscode` or `cd vscode-extension && npm install && npm run compile`
**Chrome**: `make build-chrome` (zips extension files)
**og CLI**: `make build-og` or `cd og && go build -o og .`
**og_annotate**: `make build-og-annotate` or `cd og_annotate && go build -o og_annotate .`
**Tests**: `make test` (runs all tests) or `make test-og-annotate`
**Chrome E2E**: `cd chrome-extension && npm install && npm test` (Playwright, headless)

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