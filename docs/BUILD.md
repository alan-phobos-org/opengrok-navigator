# Build Instructions

This project uses a Makefile to build both the VS Code and Chrome extensions.

## Prerequisites

- Node.js and npm (for VS Code extension)
- `vsce` package (VS Code Extension Manager): `npm install -g @vscode/vsce`
- `zip` command (usually pre-installed on Linux/macOS)

## Quick Start

```bash
# Build everything and create a single distribution zip
make

# Or explicitly:
make dist
```

This will create a `dist/` directory containing:
- `opengrok-navigator-vX.Y.Z.zip` - Single distribution package containing:
  - VS Code extension (.vsix)
  - Chrome extension (.zip)
  - Documentation (README.md, BUILD.md)
  - LICENSE
  - VERSION.txt with package contents

## Build Targets

### `make all` (default)
Builds everything and creates a single distribution zip. Same as `make dist`.

### `make build-vscode`
Builds only the VS Code extension (.vsix file).

Output: `vscode-extension/opengrok-navigator-X.Y.Z.vsix`

### `make build-chrome`
Packages only the Chrome extension (.zip file).

Output: `chrome-extension/opengrok-navigator-chrome.zip`

### `make source`
Creates a source code distribution (excludes .git, node_modules, build artifacts).

Output: `dist/opengrok-navigator-source-vX.Y.Z.zip`

### `make dist`
Complete distribution build:
1. Cleans all artifacts
2. Builds VS Code extension
3. Packages Chrome extension
4. Creates single distribution zip containing both extensions and documentation

Output: `dist/opengrok-navigator-vX.Y.Z.zip`

### `make clean`
Removes all build artifacts:
- `dist/` directory
- `vscode-extension/out/` (compiled TypeScript)
- `*.vsix` files
- `*.zip` files

### `make dev`
Quick development build (skips clean step):
- Builds VS Code extension
- Packages Chrome extension

## Manual Build Steps

### VS Code Extension

```bash
cd vscode-extension
npm install
npm run compile
npx vsce package --no-git-tag-version
```

### Chrome Extension

```bash
cd chrome-extension
zip -r opengrok-navigator-chrome.zip \
    manifest.json \
    background.js \
    content.js \
    content.css \
    options.html \
    options.js \
    README.md
```

## Installation

First, extract the distribution package:
```bash
unzip opengrok-navigator-vX.Y.Z.zip
cd package
```

### VS Code Extension

```bash
code --install-extension opengrok-navigator-1.0.0.vsix
```

Or through VS Code:
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Click "..." menu → "Install from VSIX..."
4. Select the `.vsix` file from the extracted package

### Chrome Extension

1. Extract the Chrome extension:
   ```bash
   unzip opengrok-navigator-chrome.zip -d chrome-extension
   ```

2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the extracted `chrome-extension/` directory

## Versioning

The version number is read from `vscode-extension/package.json`:

```json
{
  "version": "1.0.0"
}
```

To release a new version:
1. Update the version in `vscode-extension/package.json`
2. Run `make dist`
3. The output files will include the new version number

## Troubleshooting

### `vsce: command not found`

Install the VS Code Extension Manager:
```bash
npm install -g @vscode/vsce
```

### Permission denied errors

Ensure the Makefile is executable or run with appropriate permissions:
```bash
chmod +x Makefile
```

### Build fails with TypeScript errors

Clean and rebuild:
```bash
make clean
cd vscode-extension
npm install
make build-vscode
```

### Chrome extension doesn't load

Make sure you're loading the `chrome-extension/` directory directly, not a subdirectory or the zip file.

## CI/CD Integration

The Makefile is designed to work in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Build extensions
  run: make dist

- name: Upload artifacts
  uses: actions/upload-artifact@v3
  with:
    name: distributions
    path: dist/
```

## File Structure

```
opengrok-navigator/
├── Makefile                      # Build system
├── LICENSE                       # MIT license
├── BUILD.md                      # This file
├── dist/                         # Build outputs (gitignored)
│   ├── opengrok-navigator-vscode-vX.Y.Z.vsix
│   ├── opengrok-navigator-chrome-vX.Y.Z.zip
│   └── opengrok-navigator-source-vX.Y.Z.zip
├── vscode-extension/
│   ├── package.json              # Version and metadata
│   ├── src/                      # TypeScript source
│   ├── out/                      # Compiled JS (gitignored)
│   └── .vscodeignore             # Files to exclude from .vsix
└── chrome-extension/
    ├── manifest.json
    ├── background.js
    ├── content.js
    ├── content.css
    ├── options.html
    └── options.js
```
