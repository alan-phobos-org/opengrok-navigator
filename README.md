# OpenGrok Navigator

**Seamless bidirectional navigation between OpenGrok and VS Code** 🚀

Bridge the gap between your browser-based code exploration and local development environment with two powerful extensions that work together to supercharge your workflow.

## ✨ Features at a Glance

### 🔵 VS Code Extension
Navigate **FROM** VS Code **TO** OpenGrok with instant search and navigation:
- **⚡ Quick Jump**: Press `Ctrl+Shift+G O` to open any line in OpenGrok instantly
- **🔍 Integrated Search**: Search OpenGrok directly from VS Code with results in your sidebar
- **📋 Smart URLs**: Copy OpenGrok URLs with perfect line numbers
- **🎯 Project-Aware**: Automatically maps your workspace to OpenGrok projects
- **🔐 Secure Auth**: Built-in HTTP Basic Authentication with encrypted password storage
- **🌐 Cross-Project Search**: Search across all OpenGrok projects from one command

### 🟢 Chrome Extension
Navigate **FROM** OpenGrok **TO** VS Code with one click:
- **✨ Click-to-Open**: Ctrl+Click any line number to open directly in VS Code
- **🔄 Live Sync**: Toggle real-time synchronization - VS Code follows your OpenGrok browsing
- **👁️ Hover Previews**: See file info before opening
- **⚙️ Smart Mapping**: Configure custom project-to-workspace mappings
- **🔍 Quick File Finder** _(Experimental)_: Press `T` for fuzzy file search (GitHub-style)
- **🎨 Floating Toolbar**: Unobtrusive buttons that appear only on file pages

## 🚀 Quick Start

### Installing the VS Code Extension

```bash
cd vscode-extension
npm install
npm run compile
```

Then press `F5` in VS Code or package with `vsce package` and install the `.vsix` file.

**Configure your OpenGrok instance:**
```json
{
  "opengrok-navigator.baseUrl": "http://localhost:8080/source"
}
```

**Keyboard shortcuts:**
- `Ctrl+Shift+G O` - Open in OpenGrok
- `Ctrl+Shift+G C` - Copy URL
- `Ctrl+Shift+G V` - Search and view results in VS Code
- `Ctrl+Shift+G S` - Search and open in browser

### Installing the Chrome Extension

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `chrome-extension` directory

**Configure project mappings** in the extension options to map OpenGrok projects to your local workspace directories.

## 💡 Why Use This?

**For Code Explorers**: Browse massive codebases in OpenGrok's powerful web interface, then instantly open files locally for editing.

**For Researchers**: Search across projects in OpenGrok, then seamlessly jump into VS Code to make changes.

**For Teams**: Share OpenGrok URLs with perfect line numbers, knowing teammates can open them locally with one click.

## 🎯 Perfect For

- 📚 **Large Codebases**: Navigate projects too big for local checkout
- 🔍 **Code Archaeology**: Search historical versions in OpenGrok, edit current in VS Code
- 🤝 **Team Collaboration**: Share precise code references that open locally
- 🎓 **Learning**: Study open-source projects with back-and-forth navigation
- 🔧 **System Programming**: Essential for OS/kernel development workflows

## 📖 Documentation

- [Chrome Extension Details](chrome-extension/README.md)
- [Design Documentation](docs/)
- [Feature Roadmap](docs/FEATURE_SUGGESTIONS.md)

## 🛠️ Advanced Features

### Multi-Project Workspaces
Enable `useTopLevelFolder` mode when your workspace contains multiple projects mapped to different OpenGrok projects.

### Authentication
Supports HTTP Basic Authentication with secure password storage via VS Code's SecretStorage API.

### Live Sync
The Chrome extension can automatically open files in VS Code as you navigate through OpenGrok - perfect for code reviews and exploration sessions.

### Search Integration
Search results appear as an interactive tree view in VS Code with:
- Syntax-highlighted search terms
- One-click navigation to results
- Local file opening when available
- Fallback to browser for remote-only files

## 🔧 Requirements

- **VS Code**: 1.74.0 or higher
- **Chrome/Edge**: Modern Chromium-based browser
- **OpenGrok**: Any version (REST API support recommended, HTML fallback included)
- **VS Code URI Handler**: Must be registered (happens automatically on install)

## 📝 How It Works

**VS Code → OpenGrok**
The extension constructs OpenGrok URLs from your file path and line number, supporting both single and multi-project workspaces.

**OpenGrok → VS Code**
The Chrome extension uses the `vscode://` URI protocol to communicate with VS Code. Configure project mappings to tell it where your local repositories live.

## 🤝 Contributing

Issues and pull requests welcome! See [CLAUDE.md](CLAUDE.md) for development notes.

## 📄 License

MIT License - See LICENSE file for details

---

**Made for developers who live between their editor and their codebase** 💙
