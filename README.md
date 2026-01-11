# OpenGrok Navigator

Bidirectional navigation between OpenGrok and VS Code.

This project provides extensions for both VS Code and Chrome that enable seamless navigation between OpenGrok's web interface and your local development environment.

## Features

### VS Code Extension

Navigate from VS Code to OpenGrok:

- **Quick Jump**: Press `Ctrl+Shift+G O` to open the current line in OpenGrok
- **Integrated Search**: Search OpenGrok directly from VS Code with results displayed in the sidebar
- **URL Copying**: Copy OpenGrok URLs with accurate line numbers
- **Project Mapping**: Automatically maps your workspace to OpenGrok projects
- **Authentication**: HTTP Basic Authentication with encrypted password storage
- **Cross-Project Search**: Search across all OpenGrok projects from a single command

### Chrome Extension

Navigate from OpenGrok to VS Code:

- **Click-to-Open**: Ctrl+Click any line number to open the file directly in VS Code
- **Live Sync**: Real-time synchronization mode where VS Code follows your OpenGrok browsing
- **Hover Previews**: View file information before opening
- **Project Mapping**: Configure custom project-to-workspace directory mappings
- **Quick File Finder**: Press `T` for fuzzy file search (similar to GitHub)
- **Floating Toolbar**: Context-sensitive buttons that appear on file pages

## Installation

### VS Code Extension

```bash
cd vscode-extension
npm install
npm run compile
```

Press `F5` in VS Code to run in development mode, or package with `vsce package` and install the resulting `.vsix` file.

Configure your OpenGrok instance in VS Code settings:

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

### Chrome Extension

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `chrome-extension` directory

Configure project mappings in the extension options to map OpenGrok projects to your local workspace directories.

## Use Cases

- **Large Codebases**: Navigate projects too large for complete local checkout
- **Code Review**: Browse code in OpenGrok while editing locally in VS Code
- **Team Collaboration**: Share OpenGrok URLs that teammates can open locally
- **Historical Analysis**: Search historical versions in OpenGrok, edit current versions in VS Code

## Advanced Features

### Multi-Project Workspaces

Enable `useTopLevelFolder` mode when your workspace contains multiple projects mapped to different OpenGrok projects.

### Authentication

Supports HTTP Basic Authentication with secure password storage via VS Code's SecretStorage API.

### Live Sync

The Chrome extension can automatically open files in VS Code as you navigate through OpenGrok, useful for code reviews and exploration sessions.

### Search Integration

Search results appear as an interactive tree view in VS Code with:
- Syntax-highlighted search terms
- One-click navigation to results
- Local file opening when available
- Fallback to browser for remote-only files

## Requirements

- **VS Code**: 1.74.0 or higher
- **Chrome/Edge**: Modern Chromium-based browser
- **OpenGrok**: Any version (REST API support recommended, HTML fallback included)
- **VS Code URI Handler**: Registered automatically on extension install

## How It Works

**VS Code to OpenGrok**: The extension constructs OpenGrok URLs from your file path and line number, supporting both single and multi-project workspaces.

**OpenGrok to VS Code**: The Chrome extension uses the `vscode://` URI protocol to communicate with VS Code. Configure project mappings to specify where your local repositories are located.

## Documentation

- [Chrome Extension Details](chrome-extension/README.md)
- [Design Documentation](docs/)
- [Feature Roadmap](docs/FEATURE_SUGGESTIONS.md)

## Contributing

Issues and pull requests are welcome. See [CLAUDE.md](CLAUDE.md) for development notes.

## License

MIT License - See LICENSE file for details.
