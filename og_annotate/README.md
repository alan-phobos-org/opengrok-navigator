# og_annotate - Native Messaging Host

Native messaging host for OpenGrok annotations. Enables the Chrome extension to read/write annotation files on local or network drives.

## Installation

### Prerequisites

- Go 1.21 or later (for building)
- Chrome or Chromium browser

### macOS / Linux

1. Build and install:
   ```bash
   cd og_annotate
   go build -o og_annotate .
   ./install.sh <your-chrome-extension-id>
   ```

2. Find your extension ID:
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Find "OpenGrok to VS Code" and copy its ID

### Windows

1. Build and install:
   ```cmd
   cd og_annotate
   go build -o og_annotate.exe .
   install.bat <your-chrome-extension-id>
   ```

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

## Troubleshooting

### "Native host not found"

- Verify the manifest is installed correctly
- Check the extension ID matches
- Restart Chrome after installing

### "Access denied"

- Ensure the binary is executable (`chmod +x og_annotate`)
- Check file permissions on the annotation storage path

### Testing the host

```bash
# Send a ping request
echo -ne '\x0f\x00\x00\x00{"action":"ping"}' | ./og_annotate
```
