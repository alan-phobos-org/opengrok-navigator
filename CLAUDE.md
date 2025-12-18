# OpenGrok Navigator - Dev Notes

Bidirectional VS Code ↔ OpenGrok integration via two extensions.

## VS Code Extension (`vscode-extension/`)
- Open current line in OpenGrok, copy URLs, search & display results in sidebar
- Key files: [src/extension.ts](vscode-extension/src/extension.ts), [package.json](vscode-extension/package.json)

## Chrome Extension (`chrome-extension/`)
- Ctrl+Click line numbers to open in VS Code via `vscode://` protocol
- Floating button, hover preview, context menu, keyboard shortcuts
- Key files: [content.js](chrome-extension/content.js), [background.js](chrome-extension/background.js)

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

**VS Code**: `cd vscode-extension && npm install && npm run compile`
**Chrome**: No build needed - load unpacked from `chrome-extension/`

## Future Ideas
- Search history, file type filters, definition/symbol search, API token auth
