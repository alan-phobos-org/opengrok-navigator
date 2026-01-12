# OpenGrok Navigator - Quick Start

## Build and Package

```bash
# Build everything (single command)
make

# Output: dist/opengrok-navigator-v1.0.0.zip
```

## Install Extensions

```bash
# Extract the distribution
unzip dist/opengrok-navigator-v1.0.0.zip
cd package

# Install VS Code extension
code --install-extension opengrok-navigator-1.0.0.vsix

# Extract and load Chrome extension
unzip opengrok-navigator-chrome.zip -d chrome-extension
# Then load chrome-extension/ directory in Chrome at chrome://extensions/
```

## Configure

### VS Code Extension

1. Open VS Code Settings (Cmd/Ctrl + ,)
2. Search for "OpenGrok"
3. Set `opengrok-navigator.baseUrl` to your OpenGrok instance (e.g., `https://src.illumos.org/source`)

### Chrome Extension

1. Click the extension icon in Chrome
2. Configure project mappings (project name → local path)
3. Set default workspace root (optional)

## Usage

### VS Code Extension

| Action | Shortcut (Mac) | Shortcut (Windows/Linux) |
|--------|----------------|--------------------------|
| Open in OpenGrok | `Cmd+Shift+G O` | `Ctrl+Shift+G O` |
| Copy OpenGrok URL | `Cmd+Shift+G C` | `Ctrl+Shift+G C` |
| Search Current Project (Browser) | `Cmd+Shift+G S` | `Ctrl+Shift+G S` |
| Search Current Project (VS Code) | `Cmd+Shift+G V` | `Ctrl+Shift+G V` |
| Search All Projects (Browser) | `Cmd+Shift+G A` | `Ctrl+Shift+G A` |

### Chrome Extension

- **Quick File Finder**: Press `T` on any OpenGrok page
- **Open in VS Code**: Ctrl+Click on line numbers
- **Live Sync**: Click "⚡ Live Sync" button on file pages

## Quick File Finder (Chrome)

1. Press `T` on any OpenGrok page
2. Type 2+ characters to search
3. Navigate with ↑↓ arrow keys
4. **Enter** - Open in OpenGrok
5. **Shift+Enter** - Open in VS Code
6. **ESC** - Close

## Development

```bash
# Clean build
make clean

# Quick dev build (no clean)
make dev

# Build only VS Code extension
make build-vscode

# Build only Chrome extension
make build-chrome

# Create source package
make source
```

## Troubleshooting

### VS Code Extension

**Q: "OpenGrok Navigator: Configuration error"**
- Check `opengrok-navigator.baseUrl` is set correctly
- Ensure URL doesn't end with `/`

**Q: Search returns no results**
- Verify you're in a workspace folder
- Check the project name matches OpenGrok

### Chrome Extension

**Q: "Project mapping not found"**
- Configure project mappings in extension settings
- Project name must match OpenGrok exactly

**Q: Quick File Finder shows "File search not available"**
- Your OpenGrok instance needs REST API v1.0+
- Upgrade OpenGrok or use manual navigation

**Q: Self-signed certificate errors**
- VS Code: Disable `opengrok-navigator.rejectUnauthorized`
- Chrome: Accept certificate warning in browser

## More Information

- Full documentation: [README.md](../README.md)
- Build instructions: [BUILD.md](BUILD.md)
- Design decisions: [QUICK_FILE_FINDER_DESIGN.md](QUICK_FILE_FINDER_DESIGN.md)
- OpenGrok setup guide: [OPENGROK_OFFLINE_SETUP.md](OPENGROK_OFFLINE_SETUP.md)
