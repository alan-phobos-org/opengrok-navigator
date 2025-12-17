# Testing Guide

## Quick Start (5 minutes)

### 1. Load Extension in Chrome

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (toggle top-right)
4. Click "Load unpacked"
5. Navigate to and select: `/Users/alan/rc/opengrok-navigator/chrome-extension`
6. Extension should now appear with VS Code blue icon

### 2. Configure Project Mapping

1. Click the extension icon in Chrome toolbar (or right-click → Options)
2. Add a mapping:
   - **Project**: Your OpenGrok project name
   - **Path**: Full path to local workspace
   - Example:
     - Project: `illumos-gate`
     - Path: `/Users/alan/projects/illumos-gate`
3. Click "Save Settings"

### 3. Test It Out

1. Open an OpenGrok file page in Chrome
2. You should see:
   - Blue floating button (bottom-right)
   - Line numbers have "Ctrl+Click to open in VS Code" tooltip
3. Try these interactions:
   - Click the floating button
   - Ctrl+Click (Cmd+Click on Mac) a line number
   - Right-click a line number → "Open in VS Code"
   - Right-click page → "Open current file in VS Code"
   - Press `Ctrl+Shift+O` (Cmd+Shift+O on Mac)

### 4. Verify VS Code Opens

- VS Code should launch (if not running)
- File opens at correct line
- If error: check project mapping in extension options

## Debugging

### View Console Logs

**Content Script** (on OpenGrok page):
- Right-click page → Inspect
- Go to Console tab

**Background Service Worker**:
- Go to `chrome://extensions/`
- Find "OpenGrok to VS Code"
- Click "Inspect views: service worker"

### Common Issues

**"No mapping found for project: xxx"**
- Add mapping in extension options
- Or set a default workspace root

**Extension doesn't show on page**
- Check URL contains `/source/xref/`
- Refresh page after loading extension
- Check extension is enabled

**VS Code doesn't open**
- Test manually: paste `vscode://file//tmp/test.txt:1:1` in Chrome address bar
- Make sure VS Code is installed

## What to Test

- [x] Floating button appears
- [x] Floating button opens file
- [x] Ctrl+Click line numbers work
- [x] Context menu on line numbers
- [x] Context menu on page
- [x] Keyboard shortcut `Ctrl+Shift+O`
- [x] Keyboard shortcut `Ctrl+Shift+F`
- [x] Options page saves settings
- [x] Options page loads saved settings
- [x] Error message when no mapping
- [x] Multiple projects work

## Next Steps

If you like the basic integration, I can add:
1. **Hover preview** - Shows project/file info on hover (2-3 min)
2. **Better icons** - Professional VS Code styled icons
3. **More context menu options** - Search selected text, etc.
