# OpenGrok → VS Code Chrome Extension

**One-click navigation from OpenGrok to your local VS Code workspace** 🎯

## ✨ Features

### 🖱️ Multiple Ways to Open Files
- **📝 Floating Button**: Clean toolbar appears only on file pages
- **⚡ Live Sync**: Toggle real-time synchronization - VS Code follows as you navigate
- **👁️ Hover Preview**: See file info before opening (project, path, line)
- **⌨️ Ctrl+Click**: Hold Ctrl/Cmd and click any line number (works on file pages AND search results)
- **🔍 Quick File Finder**: Press `T` for instant file search (GitHub-style)
- **Right-Click Menu**: Context menu on line numbers and pages

### ⌨️ Keyboard Shortcuts
- `Ctrl+Shift+O` (Mac: `Cmd+Shift+O`) - Open current line in VS Code
- `Ctrl+Shift+F` (Mac: `Cmd+Shift+F`) - Open file at line 1
- `T` - Open quick file finder
- `ESC` - Close file finder

## 🚀 Quick Start

### Installation

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension` directory from this repository

### Configuration

Click the extension icon or right-click → **Options** to configure:

1. **Project Mappings** (Required):
   ```
   Project: illumos-gate
   Path: /Users/yourname/projects/illumos-gate
   ```

2. **Default Workspace Root** (Optional):
   Set a root like `/Users/yourname/projects` to auto-map projects

Settings are saved automatically.

## 💡 Usage

### Basic Navigation

1. Browse to any OpenGrok file page or search results
2. Choose your method:
   - Click **📝 Open in VS Code** button (file pages only)
   - Ctrl+Click a line number (file pages AND search results)
   - Hover over line numbers to preview (file pages AND search results)
   - Press `Ctrl+Shift+O` (file pages only)
   - Right-click → "Open in VS Code"
3. VS Code opens instantly at the exact file and line! 🎉

### Live Sync Mode

1. Click **⚡ Live Sync to VS Code** button (turns green when active)
2. Navigate through OpenGrok files and lines
3. VS Code automatically opens and follows your browsing
4. Perfect for code reviews and exploration sessions!

### Quick File Finder

1. Press `T` on any OpenGrok page
2. Type at least 2 characters to search (e.g., "main" finds all files with "main" in the path)
3. Use ↑↓ arrows to navigate results
4. Press **Enter** to open in OpenGrok, **Shift+Enter** to open in VS Code
5. Press **ESC** to close

## 🎯 How It Works

1. **URL Parsing**: Extracts project, file path, and line number from OpenGrok URLs
2. **Path Mapping**: Looks up your configured local workspace path
3. **Protocol Handler**: Uses `vscode://file/...` URIs to launch VS Code
4. **Seamless Opening**: VS Code opens at the exact file and line

## 🔧 Requirements

- Chrome/Edge or any Chromium-based browser
- VS Code installed with URI handler registered
- Local checkout of repositories you're browsing
- Project mappings configured in options

## 🛠️ Troubleshooting

### "No mapping found for project"
→ Add a project mapping in extension options

### VS Code doesn't open
→ Verify VS Code is installed and `vscode://` URIs work

### Extension not visible on OpenGrok
→ Appears on file pages (URLs with `/xref/`) and search results pages

### Ctrl+Click not working on search results
→ Make sure you're clicking directly on the line number (not the surrounding link)

### File Finder not loading files
→ Requires OpenGrok REST API v1.0+. Check your OpenGrok version and ensure the API endpoint is accessible.

## 🔒 Privacy & Security

- **100% Local**: All data stays on your machine
- **No Network Calls**: Extension doesn't phone home
- **Secure Storage**: Settings stored in Chrome's sync storage
- **Minimal Permissions**: Only activates on OpenGrok pages

## 📝 Advanced Configuration

### Default Workspace Root
If you organize projects like:
```
/Users/yourname/projects/
  ├── illumos-gate/
  ├── linux/
  └── openbsd/
```

Set default workspace root to `/Users/yourname/projects` and unmapped projects will automatically use `{root}/{project}`.

### Multi-Tab Workflow
- Live Sync state persists across page reloads
- Each file opens in your existing VS Code window
- Perfect for reviewing multiple files

## 🎨 UI Details

**Button Toolbar**:
- Appears bottom-right on file pages only
- Consistent 15px spacing between buttons
- VS Code blue theme (#007acc)
- Smooth animations and hover states

**Live Sync Indicator**:
- Gray when inactive
- Green with pulsing glow when active
- State persists across sessions

**Quick File Finder**:
- GitHub/VS Code-style fuzzy search
- Keyboard-first navigation
- Caches files for fast access
- Hidden by default (enable in options)

---

**Part of the OpenGrok Navigator project** - See main [README](../README.md) for the complete bidirectional solution.
