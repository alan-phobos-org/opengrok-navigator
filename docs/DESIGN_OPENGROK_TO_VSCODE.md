# OpenGrok to VS Code Navigation - Design Document

## Problem Statement

Build a complementary solution to the existing OpenGrok Navigator extension that enables reverse navigation: from an OpenGrok browser session (Chrome) to VS Code. When a user is viewing source code in OpenGrok and clicks on a line number or selects a line, the corresponding file should open in VS Code at that exact line.

**User Story**: As a developer browsing code in OpenGrok, I want to quickly jump to the same file and line in my local VS Code workspace so I can edit or explore the code further without manually navigating.

---

## Solution: Chrome Extension + VS Code URI Handler

**Architecture**:
```
OpenGrok Browser (Chrome)
    ↓
Chrome Extension (content + background scripts)
    ↓
vscode:// URI protocol
    ↓
VS Code (built-in URI handler)
```

### Why This Approach

**Advantages**:
- ✅ Only requires Chrome extension (no VS Code extension needed)
- ✅ Works even if VS Code isn't running (OS launches it automatically)
- ✅ Persistent configuration in Chrome extension storage
- ✅ Uses VS Code's standard URI handler
- ✅ Zero maintenance on VS Code side
- ✅ No HTTP server complexity or port conflicts

**Key Insight**: VS Code's `vscode://` URI handler provides all necessary functionality. The OS handles launching VS Code, and VS Code handles finding the appropriate workspace - no custom server code needed.

---

## Key Design Decisions

### Decision 1: URI Handler vs HTTP Server

| Approach | Pros | Cons |
|----------|------|------|
| **vscode:// URI (CHOSEN)** | Simple, works when VS Code closed, no ports | Can't query open workspaces |
| HTTP Server | Full control, workspace detection | Complex, requires VS Code extension running |

**Decision**: URI handler is simpler and more reliable for this use case.

### Decision 2: Interaction Methods

Provide **5 different ways** to open files for maximum flexibility:

1. **Floating Button** - Always visible, discoverable for new users
2. **Ctrl+Click Line Numbers** - Fast, doesn't disrupt reading flow
3. **Hover Preview** - Shows project/file info before opening
4. **Context Menu** - Familiar browser pattern, discoverable
5. **Keyboard Shortcuts** - Power users, Ctrl+Shift+O / Ctrl+Shift+F

**Rationale**: Different users have different preferences. Having multiple methods increases adoption.

### Decision 3: Project Mapping Configuration

Users configure mappings in Chrome extension options:
```
OpenGrok Project → Local Workspace Path
illumos-gate → /Users/alan/projects/illumos-gate
linux-kernel → /Users/alan/projects/linux
```

**Optional fallback**: Default workspace root for unmapped projects:
```
Default: /Users/alan/projects
Unmapped project "foo" → /Users/alan/projects/foo
```

---

## Implementation Overview

### Chrome Extension Components

**manifest.json**:
- Content scripts run on `*://*/source/xref/*` pages
- Background service worker handles context menus and keyboard shortcuts
- Permissions: `activeTab`, `storage`, `contextMenus`

**content.js** (~370 lines):
- Parses OpenGrok URL to extract project/file/line
- Enhances UI with floating button, hover previews, Ctrl+Click handlers
- Sends open requests to background script

**background.js** (~120 lines):
- Constructs `vscode://file/PATH:LINE:COL` URIs
- Manages project mappings from storage
- Handles keyboard shortcuts and context menus
- Opens URIs via `chrome.tabs.create()` (creates temporary tab, immediately closed)

**options.html/js**:
- GUI for configuring project mappings
- Settings stored in `chrome.storage.sync` (syncs across devices)

### URL Parsing

OpenGrok URL format:
```
http://host/source/xref/PROJECT/path/to/file.ext#LINE
```

Extracted components:
- Project: `PROJECT`
- File path: `path/to/file.ext`
- Line number: `LINE` (from URL hash or 1 if absent)

Constructed VS Code URI:
```
vscode://file/WORKSPACE_ROOT/path/to/file.ext:LINE:1
```

### Dark Mode Support

Challenge: Avoid FOUC (Flash of Unstyled Content) on page load.

Solution: Early script injection
- `dark-mode-init.js` runs at `document_start` (before HTML parsing)
- Synchronously checks `localStorage` for cached setting
- Sets `data-theme="dark"` attribute before first render
- CSS uses `:root[data-theme="dark"]` selectors

See [DARK_MODE_REDESIGN.md](DARK_MODE_REDESIGN.md) for details.

### Quick File Finder

Press `T` to open fuzzy file search (GitHub-style):
- Server-side search via `/api/v1/search?path=*query*`
- 300ms debounce for real-time results
- Enter opens in OpenGrok, Shift+Enter opens in VS Code
- Handles large repositories (no pre-loading)

See [QUICK_FILE_FINDER_DESIGN.md](QUICK_FILE_FINDER_DESIGN.md) for details.

---

## Error Handling

| Scenario | User Feedback |
|----------|---------------|
| Missing project mapping | Alert with link to options page |
| Invalid OpenGrok URL | Alert: "Could not parse OpenGrok URL" |
| VS Code not installed | OS prompts to install (via protocol handler) |

---

## Configuration Example

**Chrome Extension Settings**:
```json
{
  "defaultWorkspaceRoot": "/Users/alan/projects",
  "projectMappings": {
    "illumos-gate": "/Users/alan/projects/illumos-gate",
    "opengrok-navigator": "/Users/alan/rc/opengrok-navigator"
  }
}
```

**User Workflow**:
1. Visits: `http://opengrok/xref/illumos-gate/usr/src/uts/common/fs/zfs/zfs_ioctl.c#456`
2. Extension parses: project=`illumos-gate`, path=`usr/src/.../zfs_ioctl.c`, line=`456`
3. Looks up mapping: `/Users/alan/projects/illumos-gate`
4. Constructs URI: `vscode://file//Users/alan/projects/illumos-gate/usr/src/.../zfs_ioctl.c:456:1`
5. VS Code opens automatically (launches if not running)

---

## Security Considerations

1. **Minimal Permissions**: Only `activeTab`, `storage`, `contextMenus`
2. **Local Protocol Handler**: No network communication, everything local
3. **User-Configured Paths**: All paths set by user in options
4. **Explicit User Action**: File only opens when user clicks/triggers command

---

## Development Guide

### Loading Extension
```bash
1. Navigate to chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select chrome-extension/ directory
```

### Debugging
- **Content script**: Right-click page → Inspect → Console
- **Background script**: chrome://extensions/ → "Inspect views: service worker"
- **Options page**: Right-click extension icon → Options → Inspect

### Common Pitfalls

⚠️ **Service Worker State**: Don't rely on global variables - use `chrome.storage`
⚠️ **Async Messaging**: Always `return true` from `onMessage` for async responses
⚠️ **Protocol Handler**: `vscode://` URLs create temporary tabs - close them
⚠️ **CSP**: No inline scripts, no `eval()`, no inline event handlers

### Publishing

**Chrome Web Store**:
- Fee: $5 (one-time developer registration)
- Package: `zip -r extension.zip . -x "*.DS_Store"`
- Review: 1-3 days typically

**Private Distribution**:
- Share ZIP file for "Load unpacked" installation
- Or use enterprise policy for managed deployment

---

## Repository Structure

```
opengrok-navigator/
├── vscode-extension/           # VS Code → OpenGrok navigation
│   ├── src/extension.ts
│   └── package.json (v1.3.0)
├── chrome-extension/           # OpenGrok → VS Code navigation
│   ├── manifest.json (v1.3.0)
│   ├── content.js
│   ├── background.js
│   ├── dark-mode-init.js
│   ├── options.html/js
│   └── content.css
├── docs/                       # Design documentation
└── README.md                   # Main project documentation
```

---

## Feature Comparison

| Feature | Bookmarklet | Chrome Extension (Implemented) | Full HTTP Server |
|---------|-------------|-------------------------------|------------------|
| Installation | Easy (bookmark) | Medium (extension) | Hard (2 extensions) |
| Works when VS Code closed | ✅ | ✅ | ❌ |
| Persistent config | ❌ | ✅ | ✅ |
| UI integration | ❌ | ✅ | ✅ |
| Maintenance | Easy | Easy | Complex |
| **Best for** | Quick testing | Most users | Advanced features |

---

## Future Enhancements

Potential improvements (see [FEATURE_SUGGESTIONS.md](FEATURE_SUGGESTIONS.md)):
1. Symbol navigation panel
2. Breadcrumb with history
3. Code snippet clipboard manager
4. Diff comparison view
5. Multi-workspace selection

---

## References

**VS Code URI Handler**:
```
vscode://file/ABSOLUTE_PATH:LINE:COLUMN
```

Example:
```
vscode://file//Users/alice/project/src/main.ts:42:5
```

**Chrome Extension APIs**:
- Storage: `chrome.storage.sync` (synced across devices)
- Messaging: `chrome.runtime.sendMessage()` / `onMessage`
- Context Menus: `chrome.contextMenus.create()`
- Commands: Keyboard shortcuts in manifest

---

## Summary

The Chrome Extension + VS Code URI Handler approach provides the best balance of simplicity, reliability, and user experience. It works seamlessly even when VS Code isn't running, requires no server infrastructure, and provides multiple intuitive ways to jump from OpenGrok to VS Code.

**Total Implementation**: ~600 lines across 6 core files
**Development Time**: 5-8 hours including testing and documentation
**User Experience**: Professional, polished, "it just works"
