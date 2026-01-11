# OpenGrok Navigator

Bidirectional navigation between OpenGrok and VS Code.

## Features

### VS Code Extension

- Open current line in OpenGrok (`Ctrl+Shift+G O`)
- Search OpenGrok from VS Code with results in sidebar
- Copy OpenGrok URLs with line numbers
- HTTP Basic Authentication support
- Cross-project search

### Chrome Extension

- Ctrl+Click line numbers to open in VS Code
- Live sync mode (VS Code follows OpenGrok browsing)
- Quick file finder (`T` key)
- Project-to-workspace directory mappings

## Installation

### VS Code Extension

```bash
cd vscode-extension
npm install
npm run compile
```

Press `F5` to run in development mode, or package with `vsce package`.

Configure in VS Code settings:

```json
{
  "opengrok-navigator.baseUrl": "http://localhost:8080/source"
}
```

Keyboard shortcuts:
- `Ctrl+Shift+G O` - Open in OpenGrok
- `Ctrl+Shift+G C` - Copy URL
- `Ctrl+Shift+G V` - Search (results in VS Code)
- `Ctrl+Shift+G S` - Search (results in browser)

### Chrome Extension

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select `chrome-extension`

Configure project mappings in extension options.

## Advanced Configuration

### Multi-Project Workspaces

Enable `useTopLevelFolder` when your workspace contains multiple projects mapped to different OpenGrok projects.

### Authentication

HTTP Basic Authentication with password storage via VS Code's SecretStorage API.

## Requirements

- VS Code 1.74.0+
- Chromium-based browser
- OpenGrok (REST API preferred, HTML fallback supported)

## Documentation

- [Chrome Extension](chrome-extension/README.md)
- [Design Docs](docs/)

## License

MIT
