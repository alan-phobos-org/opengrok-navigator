# og_annotate - Native Messaging Host

Native messaging host for OpenGrok annotations. Enables the Chrome extension to read/write annotation files on local or network drives.

## Installation

### Prerequisites

- Chrome or Chromium browser
- Go 1.21+ is **only** required if building from source (pre-built binaries included)

### Quick Start (Recommended)

The installer will auto-detect your Chrome extension ID and select the correct binary for your platform.

**macOS / Linux:**
```bash
cd og_annotate
./install.sh
```

**Windows (PowerShell - Recommended):**
```powershell
cd og_annotate
.\install.ps1
```

**Windows (Command Prompt):**
```cmd
cd og_annotate
install.bat
```

### Manual Extension ID

If auto-detection fails, you can specify the extension ID manually:

1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Find "OpenGrok to VS Code" and copy its ID (32 lowercase letters)

Then run:
```bash
./install.sh abcdefghijklmnopqrstuvwxyz  # macOS/Linux
.\install.ps1 abcdefghijklmnopqrstuvwxyz  # Windows PowerShell
install.bat abcdefghijklmnopqrstuvwxyz    # Windows CMD
```

## Pre-built Binaries

The distribution includes pre-built binaries for all major platforms:

| Platform | Architecture | Binary |
|----------|-------------|--------|
| Linux | x86_64 | `bin/og_annotate-linux-amd64` |
| Linux | ARM64 | `bin/og_annotate-linux-arm64` |
| macOS | x86_64 (Intel) | `bin/og_annotate-darwin-amd64` |
| macOS | ARM64 (Apple Silicon) | `bin/og_annotate-darwin-arm64` |
| Windows | x86_64 | `bin/og_annotate-windows-amd64.exe` |
| Windows | ARM64 | `bin/og_annotate-windows-arm64.exe` |

The installer automatically selects the correct binary for your system. If no matching binary is found and Go is installed, it will build from source.

## Building from Source

If you prefer to build from source or need a custom build:

```bash
cd og_annotate
go build -ldflags="-s -w" -o og_annotate .
```

To cross-compile for all platforms (requires Go):
```bash
make build-og-annotate-all
```

## Installation Locations

### macOS / Linux
- Binary: `~/.local/bin/og_annotate`
- Chrome manifest: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/og_annotate.json` (macOS) or `~/.config/google-chrome/NativeMessagingHosts/og_annotate.json` (Linux)

### Windows
- Binary: `%LOCALAPPDATA%\og_annotate\og_annotate.exe`
- Manifest: `%LOCALAPPDATA%\og_annotate\og_annotate.json`
- Registry: `HKCU\Software\Google\Chrome\NativeMessagingHosts\og_annotate`

## How It Works

The native messaging host communicates with the Chrome extension using Chrome's [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) protocol:

1. Chrome extension sends JSON requests via stdin
2. Host processes requests (read/write annotation files)
3. Host returns JSON responses via stdout

## Annotation Storage Format

Annotations are stored as markdown files in a shared directory:

```
{storage_path}/
├── .editing.md                          # Who's currently editing
├── project__src__file.java.md           # Annotations for project/src/file.java
└── ...
```

### File Naming

- Path separators `/` become `__`
- Literal `__` in names become `___`
- Example: `myproject/src/App.java` → `myproject__src__App.java.md`

### Annotation Format

```markdown
# myproject/src/App.java

## Line 42 - alice - 2024-01-15T10:30:00Z

### Context
```
    private Logger logger;
>>> public void process() {
    if (input == null) {
```

### Annotation
This function needs refactoring.

---
```

## API Actions

| Action | Description |
|--------|-------------|
| `ping` | Test connectivity |
| `read` | Read annotations for a file |
| `save` | Create/update an annotation |
| `delete` | Remove an annotation |
| `startEditing` | Mark user as editing |
| `stopEditing` | Clear edit marker |
| `getEditing` | List who's currently editing |
| `listAnnotatedFiles` | List all annotated files in a project |

## Troubleshooting

### "Native host not found"

- Verify the manifest is installed correctly
- Check the extension ID matches your installed extension
- Restart Chrome after installing

### "Access denied"

- Ensure the binary is executable (`chmod +x og_annotate` on macOS/Linux)
- Check file permissions on the annotation storage path

### Extension ID auto-detection failed

The auto-detection looks for the OpenGrok Navigator extension in your Chrome profile. If it fails:
- Make sure the extension is installed in Chrome
- Make sure Chrome has been run at least once after installation
- Manually specify the extension ID as shown above

### Testing the host

```bash
# Send a ping request
echo -ne '\x0f\x00\x00\x00{"action":"ping"}' | ./og_annotate
```

Expected response: `{"success":true}` (with length prefix)

## Uninstallation

### macOS / Linux
```bash
rm ~/.local/bin/og_annotate
rm ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/og_annotate.json  # macOS
rm ~/.config/google-chrome/NativeMessagingHosts/og_annotate.json  # Linux
```

### Windows
```powershell
Remove-Item -Recurse "$env:LOCALAPPDATA\og_annotate"
Remove-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\og_annotate" -Force
```
