# OpenGrok Navigator - Claude Development Notes

## Project Overview

A VS Code extension that integrates with OpenGrok for code navigation and search. Allows users to:
- Open current line in OpenGrok with keyboard shortcuts
- Copy OpenGrok URLs to clipboard
- Search OpenGrok and display results in VS Code sidebar
- Navigate to search results in VS Code editor

## Architecture

### Core Components

1. **Search Results TreeView** ([src/extension.ts:17-99](src/extension.ts#L17-L99))
   - `SearchResultLine`: Represents a single search result with line number, URL, context, and optional local file path
   - `SearchResultFile`: Collapsible file group containing multiple line results
   - `SearchResultLineItem`: TreeView item for individual lines
   - `SearchResultsProvider`: TreeView data provider managing the hierarchy

2. **OpenGrok API Integration** ([src/extension.ts:126-184](src/extension.ts#L126-L184))
   - `searchOpenGrokAPI()`: HTTP client that intelligently fetches search results
   - **Primary method**: Attempts OpenGrok REST API v1 endpoint (`/api/v1/search`)
   - **Fallback**: Uses HTML search endpoint if REST API unavailable
   - Detects response type via `Content-Type` header (JSON vs HTML)
   - Uses quoted search terms for exact matches
   - Supports project filtering

3. **JSON Parsing** ([src/extension.ts:186-271](src/extension.ts#L186-L271))
   - `parseOpenGrokJSON()`: Parses REST API JSON responses
   - **Interface**: `OpenGrokAPIResponse` with `results` array
   - Each result contains: `path`, `lineno`, `line` (code content)
   - Cleaner and more reliable than HTML parsing

4. **HTML Parsing** ([src/extension.ts:273-432](src/extension.ts#L273-L432))
   - `parseOpenGrokResults()`: Parses OpenGrok's HTML search results (fallback)
   - **Key Pattern**: OpenGrok embeds code context inside `<a>` tags:
     ```html
     <a class="s" href="/source/xref/project/file.c#47">
       <span class="l">47</span>
       kstat_named_t *<b>kname</b>;
     </a>
     ```
   - Regex: `/<a[^>]*>.*?<\/span>\s*(.+?)<\/a>/s` extracts content after line number span
   - Cleans HTML entities (`&lt;`, `&gt;`, `&amp;`, etc.) and removes tags

5. **Commands** ([src/extension.ts:500-742](src/extension.ts#L500-L742))
   - `openInOpenGrok`: Opens current line in OpenGrok (browser or integrated)
   - `copyOpenGrokUrl`: Copies URL to clipboard
   - `searchInOpenGrok`: Searches current project and opens results in browser
   - `searchInView`: Searches current project and displays results in sidebar TreeView
   - `searchAllProjects`: Searches across all projects (using `searchall=true`) and opens results in browser
   - `clearSearchResults`: Clears the TreeView
   - `clearPassword`: Clears stored authentication password
   - `openFileInEditor`: Opens local file at specific line (used by TreeView clicks)

### URL Construction

**Format**: `{baseUrl}/xref/{projectName}/{relativePath}#{lineNumber}`

**Project Name Resolution**:
- Normal mode: Uses workspace folder name
- `useTopLevelFolder` mode: Uses first path component (for multi-project workspaces)

Example:
```
Workspace: /workspace-root/
File: /workspace-root/project-a/src/main.ts

Normal: http://localhost:8080/source/xref/workspace-root/project-a/src/main.ts#10
useTopLevelFolder: http://localhost:8080/source/xref/project-a/src/main.ts#10
```

## Configuration Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `opengrok-navigator.baseUrl` | string | `http://localhost:8080/source` | OpenGrok instance URL |
| `opengrok-navigator.projectRoot` | string | `""` | Optional project root path override |
| `opengrok-navigator.useIntegratedBrowser` | boolean | `false` | Use VS Code's Simple Browser instead of external browser |
| `opengrok-navigator.useTopLevelFolder` | boolean | `false` | Use top-level folder name as project name (for multi-project workspaces) |
| `opengrok-navigator.authEnabled` | boolean | `false` | Enable HTTP Basic Authentication |
| `opengrok-navigator.authUsername` | string | `""` | Username for HTTP Basic Authentication |

## Keyboard Shortcuts

| Action | Windows/Linux | Mac |
|--------|--------------|-----|
| Open in OpenGrok | `Ctrl+Shift+G O` | `Cmd+Shift+G O` |
| Copy OpenGrok URL | `Ctrl+Shift+G C` | `Cmd+Shift+G C` |
| Search Current Project (Browser) | `Ctrl+Shift+G S` | `Cmd+Shift+G S` |
| Search Current Project (VS Code) | `Ctrl+Shift+G V` | `Cmd+Shift+G V` |
| Search All Projects (Browser) | `Ctrl+Shift+G A` | `Cmd+Shift+G A` |

**Note**: The keybinding scheme uses `Ctrl+Shift+G` as a prefix (mnemonic: "G" for "Grok") to avoid conflicts with VS Code's core functionality like Find in Files (`Ctrl+Shift+F`), Quick Open (`Ctrl+Shift+O`), and Open External Terminal (`Ctrl+Shift+C`).

## Key Implementation Details

### HTML Context Extraction

The most critical piece of parsing is extracting code context from OpenGrok's HTML. After debugging with the actual HTML output:

```typescript
// OpenGrok structure: <a><span class="l">LINE</span> CODE</a>
const insideLinkMatch = lookAheadHtml.match(/<a[^>]*>.*?<\/span>\s*(.+?)<\/a>/s);
```

This regex:
1. Matches the opening `<a>` tag
2. Skips past the `<span class="l">...</span>` (line number)
3. Captures everything until `</a>` (the actual code with highlighted search terms in `<b>` tags)
4. HTML cleanup removes tags and decodes entities

### Search Term Highlighting

TreeView items use VS Code's `TreeItemLabel` format to highlight search terms:

```typescript
// Find all occurrences of the search term (case-insensitive)
const searchTerm = line.searchTerm.toLowerCase();
const contextLower = context.toLowerCase();
const highlights: [number, number][] = [];

let startIndex = 0;
while (startIndex < contextLower.length) {
    const index = contextLower.indexOf(searchTerm, startIndex);
    if (index === -1) break;
    highlights.push([index, index + searchTerm.length]);
    startIndex = index + searchTerm.length;
}

// Apply highlights to the label
this.label = {
    label: context,
    highlights: highlights  // Array of [start, end] positions
};
```

This creates a visual effect similar to VS Code's native search, with the search term highlighted in yellow.

### File Path Mapping

Converts OpenGrok paths to local workspace paths:

```typescript
// Extract path after /xref/{projectName}/
const xrefIndex = pathWithoutAnchor.indexOf('/xref/');
const afterXref = pathWithoutAnchor.substring(xrefIndex + 6);
const pathAfterProject = afterXref.substring(afterXref.indexOf('/') + 1);

if (useTopLevelFolder) {
    localFilePath = path.join(workspaceFolders[0].uri.fsPath, projectName, pathAfterProject);
} else {
    localFilePath = path.join(workspaceFolders[0].uri.fsPath, pathAfterProject);
}
```

### Debug Output Channel

An output channel "OpenGrok Navigator" displays debug info during searches:
- Search term and project
- First 3 HTML match samples (500 chars each)
- Pattern matching success/failure
- Extracted context

## Development History

### REST API Migration

1. **Original implementation**: HTML-only parsing from web search endpoint
2. **Problem identified**: HTML parsing is fragile and depends on OpenGrok's HTML structure
3. **Solution**: Refactored to use OpenGrok REST API v1 with HTML fallback
4. **Implementation**:
   - Added `OpenGrokAPIResponse` and `OpenGrokSearchResult` TypeScript interfaces
   - Modified `searchOpenGrokAPI()` to try `/api/v1/search` endpoint first
   - Detects JSON vs HTML via `Content-Type` header and 404 status codes
   - Created `parseOpenGrokJSON()` for clean JSON parsing
   - Handles OpenGrok's object-based response structure: `{ "results": { "/path/to/file": [ { "line": "...", "lineNumber": "123" } ] } }`
   - Maintained `parseOpenGrokResults()` as fallback for older OpenGrok versions
   - Call site routes to appropriate parser based on response type
5. **Debugging session**: Initial attempt failed with "result is not iterable"
   - Discovered OpenGrok returns results as object keyed by file path, not array
   - Fixed parser to iterate through object keys and process each file's results array
   - Added HTML entity cleaning for line content (JSON responses contain HTML markup)

### Context Extraction Evolution

1. **Initial approach**: Multiple fallback patterns (`<tt>`, `<code>`, after `</a>`, class-based)
2. **Problem**: All patterns failed - context showed "(click to view)" for all results
3. **Debug session**: Added output channel logging to inspect actual HTML
4. **Discovery**: Code content is *inside* the `<a>` tag, not after it
5. **Solution**: Single regex extracting content between `</span>` and `</a>`
6. **Final evolution**: REST API JSON response eliminates HTML parsing complexity entirely (with HTML fallback preserved)

### UI/UX Enhancements

**Search Result Display** (iteration 2):
- Removed "Line XYZ:" prefix from labels for cleaner presentation
- Moved line numbers to the `description` field (appears on right side)
- Added search term highlighting using `TreeItemLabel.highlights`
- Highlights are case-insensitive and find all occurrences
- Visual appearance matches VS Code's native search results

**Search Result Display** (iteration 3):
- Removed line numbers from result rows entirely for cleaner UI
- Removed icons from result line items
- Enhanced click behavior to select the search term within the line
- Case-insensitive search term detection and selection
- Falls back to cursor at line start if search term not found in line

**TreeView Organization**:
- Files grouped and collapsible (start collapsed)
- Lines sorted by line number within files
- Files sorted alphabetically
- Click behavior: Opens local file in editor at correct line, selects search term (if path exists), otherwise opens in browser
- Directory name shown in file item description
- Tooltip shows full context with line number

## Files

- [src/extension.ts](src/extension.ts) - Main extension code (338 lines)
- [package.json](package.json) - Extension manifest with commands, keybindings, views
- [README.md](README.md) - User documentation
- [tsconfig.json](tsconfig.json) - TypeScript configuration

## Build & Run

```bash
npm install          # Install dependencies
npm run compile      # Compile TypeScript
npm run watch        # Watch mode for development
F5                   # Launch Extension Development Host in VS Code
```

## Testing Notes

- Tested with illumos-gate project on OpenGrok
- Search term: "kname" successfully extracted context
- HTML structure confirmed to match pattern

## Command Naming

The search commands have clear names indicating scope and where results appear:
- **"Search Current Project in OpenGrok (Browser)"**: Searches within current project, opens results in web browser
- **"Search Current Project in OpenGrok (VS Code)"**: Searches within current project, displays results in VS Code sidebar TreeView
- **"Search All Projects in OpenGrok (Browser)"**: Searches across all projects, opens results in web browser

This naming scheme makes it immediately clear to users the scope of the search and where results will appear.

## Authentication

The extension supports HTTP Basic Authentication for secured OpenGrok instances:

**Implementation** ([src/extension.ts:136-191](src/extension.ts#L136-L191)):
- Password stored securely using VS Code's SecretStorage API (encrypted, not in settings.json)
- Prompts for password on first use when auth is enabled
- Password persists across VS Code sessions
- Applied to both REST API and HTML fallback requests
- Command to clear stored password: `opengrok-navigator.clearPassword`

**Security Features**:
- Password never stored in plain text
- Uses VS Code's built-in secrets management
- Base64 encoding for HTTP Basic Auth header
- Works with both HTTP and HTTPS

## Future Considerations

- REST API provides cleaner results, but HTML fallback ensures compatibility with older OpenGrok instances
- Potential feature: Search history
- Potential feature: Filter results by file type
- Potential enhancement: Support other OpenGrok REST API endpoints (definition search, symbol search, etc.)
- Potential enhancement: Support for API token authentication (Bearer tokens)
