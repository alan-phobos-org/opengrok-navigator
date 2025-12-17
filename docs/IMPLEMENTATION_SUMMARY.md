# Implementation Summary: OpenGrok to VS Code Navigation

## Quick Reference

This document summarizes the key additions to the design document.

---

## 1. Chrome Extension Development Guide

### Key Warnings for Chrome Extension Development

⚠️ **Critical Mistakes to Avoid**:

1. **Service Worker State**: Don't rely on global variables persisting - use `chrome.storage`
2. **Async Messaging**: Always `return true` from `onMessage` listener for async responses
3. **Content Script Permissions**: Content scripts can't use privileged APIs like `chrome.tabs`
4. **CSP Restrictions**: No inline scripts, no `eval()`, no inline event handlers
5. **Protocol Handler**: `vscode://` URLs may create temporary tabs - close them immediately

### Development Workflow

```bash
# Load extension
1. Navigate to chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select chrome-extension/ directory

# Debug
- Content script: Right-click page → Inspect → Console
- Background: chrome://extensions/ → "Inspect views: service worker"
- Options: Right-click icon → Options → Inspect
```

### Packaging for Chrome Web Store

```bash
cd chrome-extension
zip -r opengrok-to-vscode.zip . -x "*.DS_Store" -x "__MACOSX/*"

# Submit to: https://chrome.google.com/webstore/devconsole
# Fee: $5 (one-time)
# Review: 1-3 days typically
```

---

## 2. Repository Migration Plan

### Proposed Structure

```
opengrok-navigator/
├── vscode-extension/      # Existing VS Code extension (moved)
│   ├── src/extension.ts
│   ├── package.json
│   └── README.md
├── chrome-extension/      # New Chrome extension
│   ├── manifest.json
│   ├── content.js
│   ├── background.js
│   ├── options.html
│   └── README.md
└── README.md             # Root README linking both
```

### Migration Commands

```bash
# Create directories
mkdir vscode-extension chrome-extension

# Move VS Code files (use git mv for better history)
git mv src vscode-extension/
git mv package.json vscode-extension/
git mv tsconfig.json vscode-extension/
git mv .vscodeignore vscode-extension/

# Update CLAUDE.md paths
# [src/extension.ts](src/extension.ts)
# ↓
# [vscode-extension/src/extension.ts](vscode-extension/src/extension.ts)

# Test VS Code extension still works
cd vscode-extension
npm install && npm run compile

# Commit
git commit -m "Reorganize: separate VS Code and Chrome extensions"
```

### Alternative: Monorepo Approach

Add root `package.json` with workspaces:

```json
{
  "name": "opengrok-navigator-monorepo",
  "private": true,
  "workspaces": ["vscode-extension", "chrome-extension"],
  "scripts": {
    "build:vscode": "npm run compile --workspace=vscode-extension",
    "build:chrome": "cd chrome-extension && zip -r ../dist.zip .",
    "build": "npm run build:vscode && npm run build:chrome"
  }
}
```

Benefits:
- Single `npm install` at root
- Unified build scripts
- Shared dependencies if needed

---

## 3. Enhanced Features (ALL INCLUDED)

All three enhanced features are now included in the main implementation:

### Feature 1: Context Menu Integration ✅ INCLUDED

**What**: Right-click menu on OpenGrok pages

**Actions**:
- Right-click line number links → "Open in VS Code"
- Right-click selected code → "Search 'text' in VS Code" (placeholder)
- Right-click page → "Open current file in VS Code"

**Why This is Great**:
- Most discoverable (users naturally right-click)
- Native browser UX pattern
- Multiple actions in one place
- Works alongside other features

**Implementation**: Added to manifest.json permissions and background.js handlers

---

### Feature 2: Keyboard Shortcuts ✅ INCLUDED

**What**: Global keyboard shortcuts for quick actions

**Shortcuts**:
- `Ctrl+Shift+O` (Mac: `Cmd+Shift+O`): Open current line in VS Code
- `Ctrl+Shift+F` (Mac: `Cmd+Shift+F`): Open file at line 1

**Why This is Great**:
- Power users prefer keyboard over mouse
- Fast workflow integration
- Configurable via `chrome://extensions/shortcuts`
- Familiar pattern for VS Code users

**Implementation**: Added to manifest.json commands and background.js command handler

---

### Feature 3: Quick Peek Preview ✅ INCLUDED

**What**: Hover over line numbers to see floating preview with "Open in VS Code" button

**Features**:
- Shows project name and file path
- 500ms delay before appearing (not intrusive)
- Stays open when hovering over popup
- Smooth fade-in animation
- Close button for manual dismissal

**Why This is Great**:
- Helps users confirm correct workspace before opening
- Non-intrusive (only on hover)
- Professional, polished UX
- Displays context information

**Implementation**: Added to content.js with preview creation logic and content.css with styled popup

---

## Recommended Implementation Order

### Phase 1: Repository Restructure (30 minutes)
1. Create `vscode-extension/` and `chrome-extension/` directories
2. Move existing VS Code files to `vscode-extension/`
3. Update CLAUDE.md paths
4. Test VS Code extension still works

### Phase 2: Basic Chrome Extension (2-3 hours)
1. Create all files in `chrome-extension/` directory:
   - `manifest.json` (with all permissions and commands)
   - `content.js` (complete with all features)
   - `background.js` (complete with context menus and keyboard handlers)
   - `options.html` and `options.js`
   - `content.css` (with preview styles)
2. Create placeholder icons (can use simple PNG files initially)
3. Load extension in Chrome and test basic functionality

### Phase 3: Testing & Refinement (1-2 hours)
1. Test all interaction methods:
   - Floating button
   - Ctrl+Click on line numbers
   - Hover preview
   - Context menu (right-click)
   - Keyboard shortcuts
2. Test with various OpenGrok URL patterns
3. Test error cases (unmapped projects, etc.)

### Phase 4: Polish & Documentation (1-2 hours)
1. Create proper icons (16x16, 48x48, 128x128)
2. Write chrome-extension/README.md
3. Update root README.md
4. Take screenshots for documentation
5. Test packaging (create ZIP file)

**Total Time**: 5-8 hours for complete implementation with all features included

---

## Success Criteria

### Must Have ✅
- ✅ Click line numbers in OpenGrok → opens in VS Code (Ctrl+Click)
- ✅ Floating "Open in VS Code" button on OpenGrok pages
- ✅ Configuration UI for project mappings
- ✅ Works when VS Code is not running (OS launches it)

### Enhanced Features ✅ (All Included!)
- ✅ Context menu integration (right-click line numbers, page)
- ✅ Keyboard shortcuts (Ctrl+Shift+O, Ctrl+Shift+F)
- ✅ Quick peek preview on hover (shows project/file info)
- ✅ Clear error messages when project not mapped

### Future Enhancements
- ⭐ Settings export/import
- ⭐ History of recently opened files
- ⭐ Search integration (open VS Code search from selected text)

---

## Next Steps

1. **Review design document**: [DESIGN_OPENGROK_TO_VSCODE.md](DESIGN_OPENGROK_TO_VSCODE.md)
2. **Restructure repository**: Follow migration plan
3. **Build basic extension**: Start with core functionality
4. **Add enhanced features**: Context menu + keyboard shortcuts
5. **Test thoroughly**: Various OpenGrok URLs, edge cases
6. **Publish**: Chrome Web Store or private distribution

---

## Questions to Consider

1. **Publishing**: Chrome Web Store (public) vs private distribution (ZIP file)?
2. **Monorepo**: Use npm workspaces or keep separate?
3. **Features**: Start with basics or include enhanced features from day 1?
4. **Icons**: Create custom icons or use VS Code branding?
5. **Documentation**: Where to host screenshots and setup guides?

