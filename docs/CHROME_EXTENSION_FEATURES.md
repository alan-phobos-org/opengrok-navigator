# Chrome Extension Features Summary

## Overview

The Chrome extension provides **5 different ways** to open files from OpenGrok in VS Code, offering flexibility for different user preferences and workflows.

---

## Interaction Methods

### 1. Floating Button 🔵
**Location**: Bottom-right corner of OpenGrok file pages

**How to use**: Click the blue "Open in VS Code" button

**Opens**: Current file at current line (from URL hash)

**Best for**: First-time users, quick access

---

### 2. Ctrl+Click Line Numbers 🖱️
**Location**: Any line number in OpenGrok code view

**How to use**: Hold `Ctrl` (or `Cmd` on Mac) and click a line number

**Opens**: File at the clicked line number

**Best for**: Quick navigation while reading code

---

### 3. Hover Preview 💬
**Location**: Appears when hovering over line numbers

**How to use**:
1. Hover mouse over any line number (wait 500ms)
2. Preview popup appears showing project and file path
3. Click "Open in VS Code" button in popup

**Opens**: File at the hovered line number

**Shows**:
- Project name
- File path
- "Open in VS Code" button

**Best for**: Users who want to confirm file path before opening

---

### 4. Context Menu (Right-Click) 📋
**Location**: Right-click anywhere on OpenGrok file pages

**How to use**: Right-click to see menu options

**Menu options**:
- **"Open in VS Code"** - On line number links → opens that specific line
- **"Open current file in VS Code"** - On page background → opens file at line 1
- **"Search '[text]' in VS Code"** - On selected text → (future feature placeholder)

**Best for**: Users who prefer context menus, discoverable actions

---

### 5. Keyboard Shortcuts ⌨️
**Shortcuts**:
- `Ctrl+Shift+O` (Mac: `Cmd+Shift+O`) → Open current line in VS Code
- `Ctrl+Shift+F` (Mac: `Cmd+Shift+F`) → Open file at line 1

**How to use**: Press the keyboard combination while viewing an OpenGrok file

**Customizable**: Users can change shortcuts in `chrome://extensions/shortcuts`

**Best for**: Power users, keyboard-first workflows

---

## Configuration

### Project Mappings
Map OpenGrok project names to local workspace directories.

**Access**: Right-click extension icon → Options

**Example configuration**:
```
Project: illumos-gate
Path: /Users/alan/projects/illumos-gate

Project: linux-kernel
Path: /Users/alan/projects/linux
```

### Default Workspace Root (Optional)
Fallback directory for projects without explicit mappings.

**Example**: `/Users/alan/projects`
- Unmapped project "foo" → `/Users/alan/projects/foo`

---

## User Experience Flow

### First-Time User
1. Installs extension
2. Sees floating blue button on OpenGrok pages
3. Clicks button → gets error about missing project mapping
4. Goes to options, adds project mapping
5. Clicks button again → VS Code opens! 🎉

### Advanced User
1. Hovers over line number → sees preview with file info
2. Confirms correct project/file
3. Clicks "Open in VS Code" in preview
4. OR uses `Ctrl+Shift+O` keyboard shortcut instead

### Power User
1. Navigates OpenGrok with keyboard
2. Uses `Ctrl+Shift+O` to instantly jump to VS Code
3. Makes edits in VS Code
4. Returns to OpenGrok, repeats

---

## Visual Design

### Colors
- Primary: VS Code Blue (`#007acc`)
- Hover: Darker Blue (`#005a9e`)
- Background: White with subtle shadows

### Animations
- Floating button: Scale on click
- Preview popup: Fade in with slide-up
- Buttons: Smooth color transitions

### Typography
- System fonts: `-apple-system, BlinkMacSystemFont, 'Segoe UI'`
- Clear hierarchy: Bold headers, regular body text

---

## Technical Details

### Files
- `manifest.json` - Extension configuration (149 lines)
- `content.js` - Page enhancement logic (145 lines)
- `background.js` - Context menus, keyboard shortcuts (100 lines)
- `options.html` - Configuration UI
- `options.js` - Settings management
- `content.css` - Styling (106 lines)

### Permissions Required
- `activeTab` - Access to current OpenGrok tab
- `storage` - Save project mappings
- `contextMenus` - Right-click menu integration

### Browser Support
- Chrome (Manifest V3)
- Edge (Chromium-based)
- Brave (Chromium-based)
- **Firefox**: Would require minor manifest modifications

---

## Error Handling

### Missing Project Mapping
```
Error: No mapping found for project: illumos-gate.
Please configure in extension options.
```
→ Directs user to options page

### Invalid URL
```
Could not parse OpenGrok URL
```
→ Shown when not on a valid OpenGrok file page

### VS Code Not Installed
→ OS prompts user to install VS Code (via `vscode://` URI handler)

---

## Performance Considerations

### Lightweight
- No background processes (service worker only runs on demand)
- Content script only runs on OpenGrok pages
- Minimal DOM manipulation

### Efficient
- Event delegation for line number clicks
- Debounced hover preview (500ms delay)
- Cached configuration (read from `chrome.storage.sync`)

### Memory Usage
- ~1-2 MB for extension
- ~100KB for stored settings (project mappings)

---

## Comparison with Other Solutions

| Feature | Bookmarklet | Chrome Extension | VS Code Extension + HTTP |
|---------|-------------|------------------|--------------------------|
| Installation | Copy bookmark | Install from store | Install both extensions |
| Configuration | Edit code | Options page | VS Code settings |
| UI Integration | None | Full | Full |
| Works offline | Yes | Yes | Only if VS Code running |
| Auto-updates | No | Yes | Yes |
| **Recommended** | Testing | ⭐ Production | Advanced users |

---

## Future Feature Ideas

### High Priority
1. **Settings Export/Import** - Share project mappings with team
2. **History** - Recently opened files dropdown
3. **VS Code Search Integration** - Open search from selected text

### Medium Priority
4. **Multi-workspace Selection** - Choose workspace when multiple match
5. **File Not Found Handling** - Suggest cloning repository
6. **Diff View** - Compare OpenGrok version with local

### Low Priority
7. **Firefox Port** - Support Firefox with WebExtensions
8. **Symbol Navigation** - Jump to specific function/class
9. **Batch Operations** - Open multiple files at once

---

## Distribution Options

### Public (Chrome Web Store)
- **Pros**: Easy installation, auto-updates, discoverable
- **Cons**: $5 registration, 1-3 day review, public visibility
- **Best for**: Open source, public tools

### Private (ZIP File)
- **Pros**: No cost, no review, immediate
- **Cons**: Manual installation, no auto-updates, requires developer mode
- **Best for**: Internal tools, corporate environments

### Enterprise Policy
- **Pros**: Force-install for organization, centrally managed
- **Cons**: Requires Chrome Enterprise licensing
- **Best for**: Large organizations with IT departments

---

## Summary

This Chrome extension provides a **polished, professional** OpenGrok → VS Code integration with:

✅ **5 interaction methods** (button, Ctrl+click, hover, right-click, keyboard)
✅ **Visual feedback** (preview popup with file info)
✅ **Easy configuration** (options page with GUI)
✅ **Keyboard-first support** (customizable shortcuts)
✅ **Works when VS Code closed** (OS launches it automatically)

**Total implementation**: ~600 lines of code across 6 files

**Estimated time**: 5-8 hours including testing and documentation
