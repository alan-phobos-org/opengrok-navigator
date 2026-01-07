# OpenGrok Inline Annotations - Design Document

## Overview

Add inline source code annotations to OpenGrok via the Chrome extension. Annotations are stored as markdown files on disk (supporting network drives like `Y:\` on Windows) and displayed inline without affecting line numbers.

## User Stories

1. **Create annotation**: Click line → text box appears → type comment → save
2. **View annotations**: Toggle button shows/hides all annotations inline with source
3. **Edit annotation**: Click edit button on existing annotation → modify → save/discard
4. **Multi-user awareness**: See ✏️ when others are editing (hover for username)

## Design Decisions

| Decision | Choice |
|----------|--------|
| Filesystem access | Go native messaging host (cross-platform) |
| File naming | Double-underscore separator: `project__src__util.js.md` (escape `__` in names as `___`) |
| Delete workflow | Requires confirmation |
| Hidden annotations | Show 💬 indicator on lines with annotations |
| Duplicate annotation | Opens existing annotation for edit |
| Line drift handling | Store context: 3 lines before + annotated line + 3 lines after |
| Poll frequency | 10 seconds (configurable) |
| Error handling | Toast notification |
| UI style | B (Card) default, C (Margin) optional via setting |
| Markdown rendering | Yes - render markdown in view mode |

## Future Features (Out of Scope for v1)

- **"Start Here" view**: Curated annotations for onboarding new team members
- **Tagging/Categorization**: Group annotations by topic (e.g., `#security`, `#technical-debt`)
- **Search annotations**: Full-text search across all annotations

## UI Components

### 1. Toolbar Button
- New toggle button in existing toolbar: "💬 Annotations"
- States: Off (gray), On (active/highlighted)
- When ON: all annotations visible, "Add annotation" affordance on lines
- When OFF: 💬 indicator still visible on annotated lines

### 2. Line Annotation Trigger
- When annotations enabled: hover line number shows "+" button
- Click "+" opens annotation editor for that line
- Lines with existing annotations show 💬 indicator (visible even when toggle OFF)
- Clicking 💬 auto-enables annotations + opens existing annotation for edit
- Clicking "+" on annotated line opens existing annotation for edit

### 3. Annotation Display (Read Mode)

Two styles supported (configurable in settings):

| Style | Description | Default |
|-------|-------------|---------|
| **B: Card/Bubble** | Prominent cards with avatars, inserted below line | ✓ Yes |
| **C: Margin Note** | Side panel, doesn't break code flow | No |

See [annotation-mockup.html](annotation-mockup.html) for visual reference.

Core requirements:
- Fixed-width font matching OpenGrok
- Shows author name
- Markdown rendering (bold, lists, code blocks, etc.)
- Edit button (requires confirmation for delete)
- Inserted between source lines (B) or alongside (C), doesn't shift line numbers
- Multi-line content supported

### 4. Annotation Editor (Edit Mode)

- Textarea with monospace font
- Auto-focus when opened
- Save (Ctrl+Enter) / Discard (Escape) buttons
- While editing: ✏️ indicator visible to other users (hover shows username)

## Storage Format

### Directory Structure
```
{annotation_root}/
├── .editing.md                              # Currently-being-edited tracker
├── {project}__path__to__file.java.md        # Double-underscore as path separator
├── {project}__another__Component.tsx.md
└── ...
```

**Filename encoding**: Use `__` as path separator. If a filename contains `__`, escape as `___`.
Example: `my__file.js` in `src/` → `project__src__my___file.js.md`

### Annotation File Format (`myproject__src__services__DataProcessor.java.md`)
```markdown
# myproject/src/services/DataProcessor.java

## Line 42 - alan - 2024-01-15T10:30:00Z

### Context
```
    // Previous context (3 lines before)
    private Logger logger = LoggerFactory.getLogger(this.getClass());

>>> public void processData(DataStream input) {

    // Following context (3 lines after)
    if (input == null) {
        throw new IllegalArgumentException("Input cannot be null");
```

### Annotation
This function needs refactoring - it's doing too much.
Consider splitting into validate() and transform().

---

## Line 87 - bob - 2024-01-14T15:45:00Z

### Context
```
    result.setTimestamp(now);
    result.setStatus(Status.COMPLETE);
>>> return result.build();
    }
}
```

### Annotation
Potential NPE here if result is null.

---
```

**Note**: Context code blocks use no language hint (plain ```) for simplicity.

### Edit Tracking File (`.editing.md`)
```markdown
# Currently Being Edited

alan: /path/to/file.java:42 @ 2024-01-15T10:30:00Z
bob: /another/file.ts:15 @ 2024-01-15T10:32:00Z
```

Timestamps allow clients to detect stale entries (e.g., from crashed browsers).

## Configuration

### Settings (via options page)
- **Annotation Storage Path**: Text input for path (e.g., `Y:\shared\annotations` or `/mnt/share/annotations`)
- **Author Name**: Username for attribution
- **Auto-show Annotations**: Checkbox (default: off)
- **Display Style**: Dropdown - "Card (below line)" or "Margin note (side panel)" (default: Card)
- **Poll Interval**: Number input in seconds (default: 10)

### First-Use Flow
1. User clicks "Add annotation" on any line
2. If no storage path configured: modal prompts for path + author name
3. Settings saved:
   - `chrome.storage.local`: Annotation path (machine-specific)
   - `chrome.storage.sync`: Author name, display style, poll interval (sync across devices)

## Technical Architecture

### New Files
- `annotations.js` - Core annotation logic (separate module)
- `annotations.css` - Annotation styling
- `og_annotate/` - Go native messaging host (new directory, underscore for Chrome compatibility)

### Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   content   │────▶│ background  │────▶│ og_annotate │
│    .js      │◀────│    .js      │◀────│  (Go host)  │
└─────────────┘     └─────────────┘     └─────────────┘
     UI              Message relay       File I/O
```

### Native Messaging Host (`og_annotate`)

Go application compiled for:
- **Windows**: amd64, arm64
- **macOS**: amd64 (Intel), arm64 (Apple Silicon)
- **Linux**: amd64, arm64

Features:
- Reads/writes annotation markdown files
- Handles network drive paths (`Y:\`, `\\server\share`, `/mnt/...`)
- Manages `.editing.md` for live edit tracking
- Parses and generates markdown annotation format

#### Installation

Provide both:
1. **Installer script** per platform (automates manifest registration)
2. **Manual instructions** for each platform

| Platform | Manifest Location |
|----------|-------------------|
| Windows | Registry: `HKCU\Software\Google\Chrome\NativeMessagingHosts\` |
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/og_annotate.json` |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/og_annotate.json` |

### Key Functions

```javascript
// annotations.js (content script)
class AnnotationManager {
  constructor(project, filePath) {}

  async loadAnnotations() {}           // Load from storage
  async saveAnnotation(line, text) {}  // Save new/updated
  async deleteAnnotation(line) {}      // Remove annotation (with confirm)

  renderAnnotations() {}               // Display in DOM
  showEditor(line) {}                  // Open edit UI (or edit existing)
  hideEditor() {}                      // Close edit UI

  startEditTracking(line) {}           // Mark as being edited
  stopEditTracking() {}                // Clear edit marker
  pollEditStatus() {}                  // Check for others editing
}

// background.js additions
async function readAnnotationFile(project, filePath) {}
async function writeAnnotationFile(project, filePath, content) {}
async function updateEditTracking(user, file, line) {}
async function clearEditTracking(user) {}
```

### Polling Strategy
When annotations are enabled, poll every 10 seconds (configurable):
1. **`.editing.md`**: Update UI to show/hide ✏️ indicators for other users editing
2. **Annotation files**: Refresh annotations to show changes from other users

Clear own edit marker on save/discard/page unload.

## Known Limitations

1. **`>>>` marker collision**: The context block uses `>>>` to mark the annotated line. If source code contains `>>>` (Python doctest, shell heredoc), it may display ambiguously. Future: use unique marker or escape.
2. **XSS via markdown**: Must use sanitizing markdown renderer (e.g., marked.js + DOMPurify) to prevent malicious HTML injection.

## Edge Cases

1. **Conflicting edits**: Last-write-wins (accepted for v1)
2. **File renamed/moved**: Annotations orphaned (future: link to line content hash)
3. **Line numbers changed**: Context helps identify original location
4. **Network drive unavailable**: Show toast error
5. **Large files**: Lazy-load annotations as user scrolls
6. **Context at file boundaries**: If line 2 is annotated, only 1 line of preceding context available (line number makes this clear)

## Implementation Phases

### Phase 1: Core MVP
- [ ] Native messaging host setup
- [ ] Basic add/view annotations
- [ ] Settings UI for path and author
- [ ] Toggle button in toolbar

### Phase 2: Edit & Polish
- [ ] Edit existing annotations
- [ ] Delete annotations (with confirmation)
- [ ] Context capture (3 lines before/after)
- [ ] Markdown rendering in display
- [ ] Keyboard shortcuts

### Phase 3: Multi-User
- [ ] Edit tracking (✏️ feature)
- [ ] Periodic polling for annotation file changes
- [ ] Handle concurrent edits gracefully (last-write-wins)

---

## Resolved Questions

| Question | Decision |
|----------|----------|
| Native messaging vs local server | Go native host |
| Path format on Windows | Support `Y:\`, `\\server\share`, etc. |
| Context lines | 3 before + annotated line + 3 after |
| Markdown in annotations | Yes - render in view mode |
| Delete confirmation | Required |
| Line number drift | Context lines provide human-readable reference |
| Search/filter | Future feature |
| UI style | B (Card) + C (Margin) with setting, B default |
| Toggle OFF + click 💬 | Auto-enable annotations + open for edit |
| Refresh from others | Poll annotation files (not just `.editing.md`) |
| Code block language | No language hint (plain ```) |

## Deferred Questions

1. **Offline mode**: Cache annotations locally when network drive unavailable? (defer to v2)
