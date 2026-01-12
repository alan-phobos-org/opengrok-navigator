# OpenGrok Navigator

Bidirectional navigation between OpenGrok and VS Code.

## Features

### VS Code Extension
- Open current line in OpenGrok (`Ctrl+Shift+G O`)
- Search OpenGrok with results in sidebar
- Copy OpenGrok URLs with line numbers
- HTTP Basic Authentication support

### Chrome Extension
- Ctrl+Click line numbers to open in VS Code
- Quick file finder (`T` key)
- Live sync mode (VS Code follows browsing)
- Inline source code annotations

### og CLI Tool
- Command-line OpenGrok search
- Call graph tracing with `og trace`
- Multiple search types: full, def, symbol, path, hist

## Quick Start

```bash
# Build and install
./build.sh dist
./install.sh

# Configure VS Code extension
# Set opengrok-navigator.baseUrl in VS Code settings

# Configure Chrome extension
# Load unpacked from ~/.opengrok-navigator/chrome-extension/
# Set project mappings in extension options
```

See [docs/QUICKSTART.md](docs/QUICKSTART.md) for detailed setup.

## Keyboard Shortcuts

| Action | VS Code | Chrome |
|--------|---------|--------|
| Open in OpenGrok | `Ctrl+Shift+G O` | - |
| Copy URL | `Ctrl+Shift+G C` | - |
| Search (VS Code) | `Ctrl+Shift+G V` | - |
| Quick File Finder | - | `T` |
| Open in VS Code | - | `Ctrl+Click` |
| Create Annotation | - | `C` (hover on line) |

## Documentation

- [**Quick Start**](docs/QUICKSTART.md) - Installation and configuration
- [**Build Guide**](docs/BUILD.md) - Development and build instructions
- [**Project Plan**](docs/PLAN.md) - Vision, roadmap, and backlog
- [**Architecture**](docs/DESIGN.md) - System design and decisions
- [Full documentation index](docs/README.md)

## Requirements

- VS Code 1.74.0+
- Chromium-based browser
- Go 1.21+ (for building og CLI and og_annotate)
- OpenGrok server (REST API preferred, HTML fallback supported)

## License

MIT
