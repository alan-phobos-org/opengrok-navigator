# Technical Reference

Detailed technical specifications for OpenGrok Navigator components.

**Read this file when:** implementing new features, debugging integration issues, or modifying native messaging.

---

## Architecture Overview

**Core Components** (`vscode-extension/src/extension.ts`):
1. TreeView (lines 17-99): `SearchResultLine`, `SearchResultFile`, `SearchResultsProvider`
2. API Integration (126-184): `searchOpenGrokAPI()` - tries REST API v1, falls back to HTML
3. JSON Parsing (186-271): `parseOpenGrokJSON()` for REST API responses
4. HTML Parsing (273-432): `parseOpenGrokResults()` fallback
5. Commands (500-742): `openInOpenGrok`, `copyOpenGrokUrl`, `searchInView`, etc.

### URL Format

```
{baseUrl}/xref/{projectName}/{relativePath}#{lineNumber}
```

- Normal mode: uses workspace folder name
- `useTopLevelFolder` mode: uses first path component

### VS Code Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `baseUrl` | `http://localhost:8080/source` | OpenGrok server URL |
| `projectRoot` | - | Local project root override |
| `useIntegratedBrowser` | false | Open in VS Code browser |
| `useTopLevelFolder` | false | Use first path component |
| `authEnabled` | false | Enable HTTP Basic Auth |
| `authUsername` | - | Auth username (password in SecretStorage) |

### Keybindings

Prefix: `Ctrl+Shift+G` ("G" for Grok)

| Key | Action |
|-----|--------|
| O | Open in OpenGrok |
| C | Copy URL |
| S | Search in browser |
| V | Search in VS Code |
| A | Search all projects |

---

## Native Messaging (CRITICAL)

**IMPORTANT**: The Chrome extension ↔ og_annotate link requires exact name matching across multiple files.

### Message Flow

```
annotations.js → chrome.runtime.sendMessage() → background.js
    → chrome.runtime.sendNativeMessage('og_annotate', ...) → og_annotate binary
    → stdio response → back through the chain
```

### Critical Link Points

| Component | File | Key Value |
|-----------|------|-----------|
| Host name constant | `background.js:20` | `const NATIVE_HOST = 'og_annotate'` |
| Permission | `manifest.json:10` | `"nativeMessaging"` |
| Manifest name | install.sh / install.ps1 | `"name": "og_annotate"` |
| Binary protocol | `og_annotate/main.go` | 4-byte little-endian length + JSON |

### Action Mapping

Background.js strips the `annotation:` prefix before forwarding:

| Chrome Action | og_annotate Handler |
|--------------|-------------------|
| `annotation:ping` | `ping` |
| `annotation:read` | `read` |
| `annotation:save` | `save` |
| `annotation:delete` | `delete` |
| `annotation:startEditing` | `startEditing` |
| `annotation:stopEditing` | `stopEditing` |
| `annotation:getEditing` | `getEditing` |

### Native Messaging Manifest Locations

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/og_annotate.json` |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/og_annotate.json` |
| Windows | Registry `HKCU:\Software\Google\Chrome\NativeMessagingHosts\og_annotate` → file |

### Manifest Format

```json
{
  "name": "og_annotate",
  "path": "/path/to/og_annotate",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://EXTENSION_ID/"]
}
```

**When modifying**: If you change the host name, you MUST update: `NATIVE_HOST` constant, installer manifest generation, and og_annotate binary name expectations.

---

## Annotations Feature

### Architecture

```
Chrome extension ↔ background.js ↔ og_annotate (native host) ↔ filesystem
```

### Storage Format

Markdown files with double-underscore path encoding:
- `project__src__file.java.md` for `project/src/file.java`
- Escape `__` in names as `___`

### Key Components

| File | Purpose |
|------|---------|
| `annotations.js` | AnnotationManager class, UI rendering, polling |
| `annotations.css` | Margin note style with yellow accent |
| `og_annotate/` | Go native host for file I/O |

### Chrome Extension Settings

| Setting | Storage | Purpose |
|---------|---------|---------|
| Storage path | `chrome.storage.local` | Annotation directory |
| Author name | `chrome.storage.sync` | Attribution |
| Poll interval | `chrome.storage.sync` | Refresh rate |

### Chrome Extension Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `t` | Quick file finder |
| `c` | Create annotation (hover over line number) |
| `x` | Jump to next annotation |

---

## Implementation Details

### HTML Parsing

Regex for extracting code after line number span:
```regex
/<a[^>]*>.*?<\/span>\s*(.+?)<\/a>/s
```

### Search Term Highlighting

Uses `TreeItemLabel.highlights` for yellow highlighting in VS Code.

### Path Mapping

Extracts `/xref/{project}/path` → local workspace path.

### Authentication

HTTP Basic Auth via VS Code SecretStorage, applied to both REST and HTML requests.

### REST API Migration

Prefers REST API v1 (clean JSON), falls back to HTML for older OpenGrok versions.

---

## Installation Paths

| Component | Unix | Windows |
|-----------|------|---------|
| Chrome extension | `~/.opengrok-navigator/chrome-extension/` | `%LOCALAPPDATA%\opengrok-navigator\` |
| og_annotate binary | `~/.local/bin/og_annotate` | `%LOCALAPPDATA%\og_annotate\` |

---

## OpenGrok Installer Scripts

**Target Platform**: Ubuntu 20.04+ (also works on RHEL/CentOS with iptables)

### Key Files

| File | Purpose |
|------|---------|
| `scripts/install-opengrok.sh` | Offline installer |
| `scripts/download-dependencies.sh` | Downloads required tarballs |

### Port 80 Support

Uses iptables NAT rules to redirect privileged ports (< 1024) to Tomcat on 8080.
- Ubuntu: install `iptables-persistent` for persistence
- RHEL: install `iptables-services` for persistence
