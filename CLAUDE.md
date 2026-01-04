# OpenGrok Navigator - Dev Notes

Bidirectional VS Code ↔ OpenGrok integration via extensions and CLI tool.

**Current Version:** v1.3.0

## Components

### VS Code Extension (`vscode-extension/`)
- Open current line in OpenGrok, copy URLs, search & display results in sidebar
- Key files: [src/extension.ts](vscode-extension/src/extension.ts), [package.json](vscode-extension/package.json)

### Chrome Extension (`chrome-extension/`)
- Ctrl+Click line numbers to open in VS Code via `vscode://` protocol
- Floating button, hover preview, context menu, keyboard shortcuts
- Key files: [content.js](chrome-extension/content.js), [background.js](chrome-extension/background.js)

### og CLI Tool (`og/`)
- Command-line OpenGrok search client written in Go
- Search types: full, def, symbol, path, hist
- Call graph tracing with `trace` command
- Key files: [main.go](og/main.go), [client.go](og/client.go), [trace.go](og/trace.go)

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

## Build

**All**: `make dist` (builds everything and creates distribution zip)

**VS Code**: `make build-vscode` or `cd vscode-extension && npm install && npm run compile`
**Chrome**: `make build-chrome` (no compile needed - just zips)
**og CLI**: `make build-og` or `cd og && go build -o og .`
**og dist**: `make dist-og` (source + binary zip)
**scripts dist**: `make dist-scripts` (VM setup scripts zip)
**og tests**: `make test-og` or `cd og && go test -v ./...`

## OpenGrok Installer Scripts (`scripts/`)

**Target Platform**: Ubuntu 20.04+ (also works on RHEL/CentOS with iptables)

**Key files**:
- [install-opengrok.sh](scripts/install-opengrok.sh) - Offline installer
- [download-dependencies.sh](scripts/download-dependencies.sh) - Downloads required tarballs

**Port 80 Support**: Uses iptables NAT rules to redirect privileged ports (< 1024) to Tomcat on 8080. Requires `iptables` package; for persistence install `iptables-persistent` (Ubuntu) or `iptables-services` (RHEL).

## Hints

* Claude is extremely concise when reporting progress and summarising changes (don't include line numbers or precise files)
* All design docs should go into the `docs` folder