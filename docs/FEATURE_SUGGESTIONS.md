# Feature Suggestions for OpenGrok Navigator

Based on analysis of similar code navigation plugins (GitHub/GitLab browser extensions, Sourcegraph, Octotree, etc.), here are additional features that could enhance the OpenGrok Navigator experience:

## 1. **Quick File Finder** (High Value)
**Similar to:** GitLab/GitHub's `t` keyboard shortcut, Octotree's file tree search

**Description:** Add a floating search box (triggered by pressing `t` or `/`) that allows fuzzy searching of files in the current project without leaving the OpenGrok page.

**Implementation:**
- Keyboard trigger: Press `t` to open overlay
- Fuzzy search through file paths in current project
- Show top 10 matches in real-time dropdown
- Arrow keys to navigate, Enter to open in VS Code or browser
- ESC to dismiss

**Benefits:**
- Eliminates need to navigate through directory tree
- Matches muscle memory from GitHub/GitLab
- Faster than using OpenGrok's native search for known files

**Technical Approach:**
- Fetch file list from OpenGrok API or parse from directory listings
- Cache file list per project in `chrome.storage.local`
- Use Levenshtein distance or simple substring matching for fuzzy search
- Display as modal overlay with autocomplete dropdown

---

## 2. **Symbol Navigation Panel** (Medium-High Value)
**Similar to:** Sourcegraph's symbol sidebar, VS Code's outline view, GitHub's symbol search

**Description:** Add a collapsible side panel showing all functions, classes, and important symbols in the current file for quick navigation.

**Implementation:**
- Floating collapsible panel on left or right side
- Parse file content to extract symbols (functions, classes, structs, etc.)
- Click symbol to jump to that line in OpenGrok AND sync to VS Code (if live-sync enabled)
- Language-aware parsing (C/C++, Java, Python, etc.)
- Filter box at top to search within symbols

**Benefits:**
- Quick overview of file structure
- Fast navigation within large files
- Matches VS Code's outline view behavior
- Useful for understanding unfamiliar code

**Technical Approach:**
- Use regex patterns for common languages to extract symbols
- Parse OpenGrok's existing syntax highlighting for symbol detection
- Could leverage OpenGrok's ctags data if available via API
- Store panel state (open/closed, width) in `chrome.storage.local`

---

## 3. **Breadcrumb Navigation with History** (Medium Value)
**Similar to:** Browser extensions like "Crumbly", GitHub's breadcrumb bar

**Description:** Add an enhanced breadcrumb navigation bar at the top showing your navigation history with quick back/forward buttons and recently visited files dropdown.

**Implementation:**
- Sticky breadcrumb bar at top of page
- Shows: Project > Directory > ... > File
- Each segment is clickable
- "Recent" dropdown showing last 10 visited files across projects
- Back/Forward buttons (with keyboard shortcuts Alt+Left/Right)
- "Copy Path" button for current file

**Benefits:**
- Easier navigation between related files
- Quick access to recently viewed code
- Reduces cognitive load of remembering navigation path
- Clipboard integration for sharing file paths

**Technical Approach:**
- Inject custom breadcrumb bar into DOM
- Track navigation history in `chrome.storage.local` (max 50 items)
- Parse OpenGrok URL to build breadcrumb segments
- Use Chrome history API for back/forward navigation
- Add keyboard event listeners for Alt+Left/Right

---

## 4. **Code Snippet Clipboard Manager** (Lower Priority but Unique)
**Similar to:** Developer-focused clipboard managers, but integrated into browser

**Description:** When you copy code snippets from OpenGrok, automatically capture metadata (file path, line numbers, project, timestamp) and maintain a persistent clipboard history.

**Implementation:**
- Intercept `copy` events on code content
- Store copied text + metadata in `chrome.storage.local`
- Add "Clipboard History" button (bottom toolbar)
- Panel shows last 20 copied snippets with:
  - Code preview
  - Source file + line numbers
  - "Open in VS Code" button
  - "Copy with citation" (includes file path comment)
  - Timestamp

**Benefits:**
- Never lose that code snippet you copied 10 minutes ago
- Automatically documents where code came from
- Great for code review or creating documentation
- Useful for comparing similar code across files

**Technical Approach:**
- Add `document.addEventListener('copy', ...)` handler
- Detect if selection is within code area (check parent elements)
- Store in `chrome.storage.local` with 100 snippet limit (rolling)
- Modal or slide-out panel for history view
- Export history as JSON for backup

---

## 5. **Diff Comparison View** (Bonus - Advanced)
**Similar to:** GitHub's file comparison, Sourcegraph's diff view

**Description:** Compare the current file with another revision, branch, or entirely different file side-by-side.

**Implementation:**
- Add "Compare" button next to "Open in VS Code"
- Modal to select:
  - Different revision (use OpenGrok's revision parameter)
  - Different file (paste path or use file finder)
  - Clipboard content (compare live with what's in OpenGrok)
- Side-by-side or unified diff view
- Highlight additions/deletions
- Option to open both versions in VS Code split view

**Benefits:**
- Understand changes between revisions without leaving browser
- Compare implementations across similar files
- Useful for code review workflows

**Technical Approach:**
- Fetch two file versions via OpenGrok API
- Use a library like `diff` (npm) or `diff-match-patch`
- Render diff in modal overlay with syntax highlighting
- For VS Code integration: open both files and run diff command via vscode:// URIs

---

## Recommended Implementation Priority

1. **Quick File Finder** - Highest ROI, relatively simple to implement (~2-3 hours)
2. **Breadcrumb Navigation with History** - Good UX improvement, moderate complexity (~3-4 hours)
3. **Symbol Navigation Panel** - Very useful but requires more sophisticated parsing (~4-5 hours)
4. **Code Snippet Clipboard Manager** - Unique feature, good for productivity (~2-3 hours)
5. **Diff Comparison View** - Complex, lower priority unless doing code reviews (~5-6 hours)

---

## Notes

- All features should respect the existing live-sync functionality
- Maintain consistent VS Code blue theme across new UI elements
- Add keyboard shortcuts that don't conflict with OpenGrok's existing bindings
- Consider making each feature toggleable in extension options
- All new features should degrade gracefully if OpenGrok structure changes
