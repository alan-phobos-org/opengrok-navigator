# Favourite Projects Search - Design Document

## Overview

This feature allows users to maintain a list of "favourite" OpenGrok projects and search across this subset via a new right-click context menu command. This is useful for users who work with many projects but frequently need to search only within a specific subset (e.g., their team's repositories, a product line, or related components).

## Problem Statement

Currently, the VS Code extension offers:
- **Search Current Project** - Searches only the project derived from the current file
- **Search All Projects** - Searches across all projects in the OpenGrok instance

Neither option serves users who want to search across a specific, curated subset of projects. For example:
- A developer working on "service-auth" may frequently need to search across related services: `service-auth`, `service-gateway`, `lib-common`
- An infrastructure team may want to search across all infrastructure repos but not application code
- A researcher may track a specific set of repositories for a particular investigation

## Proposed Solution

Add a new VS Code extension setting for favourite projects and a new right-click context menu command to search across them.

### User Experience

1. **Configuration**: User adds a list of project names to VS Code settings:
   ```json
   {
     "opengrok-navigator.favouriteProjects": ["kernel", "libc", "drivers/net"]
   }
   ```

2. **Usage**: Right-click in editor → "Search Favourite Projects in OpenGrok" → opens browser with search scoped to configured projects

3. **Keyboard shortcut**: `Ctrl+Shift+G F` (Mac: `Cmd+Shift+G F`)

---

## Key Design Decisions

### Decision 1: Query String Format for Multiple Projects

**Research findings:**

OpenGrok supports multiple methods for specifying projects in search queries:

| Method | Format | Notes |
|--------|--------|-------|
| **Repeated `project` parameter** | `?project=p1&project=p2&project=p3` | Standard approach, each project specified separately |
| **`allprojects=1` parameter** | `?allprojects=1` | Searches all projects (alternative to listing them all) |
| **REST API `projects` param** | `/api/v1/search?projects=p1,p2` | Comma-separated for REST API (not web UI) |

**Sources:**
- [OpenGrok QueryParameters Javadoc](https://oracle.github.io/opengrok/javadoc/org/opengrok/indexer/web/QueryParameters.html)
- [GitHub Issue #563](https://github.com/oracle/opengrok/issues/563) - Documents URL length limitations with many projects

**Decision: Use repeated `project` parameter for web UI search**

**Rationale:**
- This is the standard format OpenGrok's web interface uses
- Compatible with all OpenGrok versions
- Works directly with the browser-based search results page
- For a "favourites" list, the URL length is unlikely to be problematic (typical use case: 5-20 projects)

**URL Format:**
```
{baseUrl}/search?project={p1}&project={p2}&project={p3}&full={query}&defs=&refs=&path=&hist=&type=
```

**CRITICAL:** OpenGrok requires the empty search type parameters (`defs=&refs=&path=&hist=&type=`) to properly scope the search. Without these, OpenGrok may ignore the project filters and search all projects instead.

**Example:**
```
http://opengrok.example.com/source/search?project=kernel&project=libc&project=drivers&full=%22my%20search%22&defs=&refs=&path=&hist=&type=
```

---

### Decision 2: Configuration Storage

**Options considered:**

| Approach | Pros | Cons |
|----------|------|------|
| **A) VS Code settings (array)** | Standard, syncs across machines, easy to edit | No project-specific favourites |
| **B) Workspace settings** | Project-specific | Doesn't persist across workspaces |
| **C) Dedicated config file** | Maximum flexibility | Non-standard, requires file management |

**Decision: Option A - VS Code settings with array type**

**Rationale:**
- Consistent with existing extension settings pattern
- Settings sync works across machines
- Users can override at workspace level if needed
- Simple JSON array is intuitive to edit
- No additional file management complexity

**Configuration Schema:**
```json
{
  "opengrok-navigator.favouriteProjects": {
    "type": "array",
    "items": {
      "type": "string"
    },
    "default": [],
    "description": "List of OpenGrok project names to include when using 'Search Favourite Projects'. Example: [\"kernel\", \"libc\", \"drivers\"]"
  }
}
```

---

### Decision 3: Empty Favourites Behavior

**Options considered:**

| Approach | Behavior |
|----------|----------|
| **A) Error message** | Show error if no favourites configured |
| **B) Fall back to current project** | Act like "Search Current Project" |
| **C) Fall back to all projects** | Act like "Search All Projects" |
| **D) Prompt to configure** | Open settings with helpful message |

**Decision: Option D - Prompt to configure with quick action**

**Rationale:**
- Provides clear guidance to new users
- Doesn't silently change behavior
- Quick action makes configuration easy
- Consistent with VS Code UX patterns

**Implementation:**
```typescript
if (favouriteProjects.length === 0) {
  const action = await vscode.window.showWarningMessage(
    'No favourite projects configured. Add projects to search.',
    'Configure Favourites'
  );
  if (action === 'Configure Favourites') {
    vscode.commands.executeCommand(
      'workbench.action.openSettings',
      'opengrok-navigator.favouriteProjects'
    );
  }
  return;
}
```

---

### Decision 4: Browser vs VS Code Sidebar Search

**Options considered:**

| Approach | Pros | Cons |
|----------|------|------|
| **A) Browser only** | Simple, consistent with "Search All Projects" | No in-editor experience |
| **B) Sidebar only** | Integrated experience | Complex: API doesn't directly support multi-project |
| **C) Both commands** | Maximum flexibility | Code duplication, more commands to maintain |

**Decision: Option A - Browser-based search only (initially)**

**Rationale:**
- Mirrors existing "Search All Projects" command behavior
- OpenGrok's REST API `/api/v1/search` supports multi-project via `projects` parameter, but the response handling would need updates to parse results from multiple projects correctly
- Browser search provides full OpenGrok UI features (faceting, pagination, highlighting)
- Can add sidebar support in future iteration if user demand exists

---

## Implementation Details

### New Configuration Setting

**package.json addition:**
```json
{
  "opengrok-navigator.favouriteProjects": {
    "type": "array",
    "items": {
      "type": "string"
    },
    "default": [],
    "markdownDescription": "List of OpenGrok project names to include when using 'Search Favourite Projects'. Example: `[\"kernel\", \"libc\", \"drivers\"]`",
    "scope": "resource"
  }
}
```

### New Command

**package.json addition:**
```json
{
  "command": "opengrok-navigator.searchFavouriteProjects",
  "title": "Search Favourite Projects in OpenGrok (Browser)"
}
```

### Context Menu Entry

**package.json menus addition:**
```json
{
  "command": "opengrok-navigator.searchFavouriteProjects",
  "when": "editorTextFocus",
  "group": "navigation@6"
}
```

### Keybinding

**package.json keybindings addition:**
```json
{
  "command": "opengrok-navigator.searchFavouriteProjects",
  "key": "ctrl+shift+g f",
  "mac": "cmd+shift+g f",
  "when": "editorTextFocus"
}
```

### Command Implementation

```typescript
// Command: Search favourite projects in OpenGrok
const searchFavouriteProjectsDisposable = vscode.commands.registerCommand(
  'opengrok-navigator.searchFavouriteProjects',
  async () => {
    const editor = vscode.window.activeTextEditor;
    const config = vscode.workspace.getConfiguration('opengrok-navigator');
    const baseUrl = config.get<string>('baseUrl');
    const favouriteProjects = config.get<string[]>('favouriteProjects', []);

    if (!baseUrl) {
      vscode.window.showErrorMessage(
        'OpenGrok base URL is not configured. Please set it in settings.'
      );
      return;
    }

    // Check if favourites are configured
    if (favouriteProjects.length === 0) {
      const action = await vscode.window.showWarningMessage(
        'No favourite projects configured. Add projects to search across.',
        'Configure Favourites'
      );
      if (action === 'Configure Favourites') {
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'opengrok-navigator.favouriteProjects'
        );
      }
      return;
    }

    // Get selected text or prompt for search term
    let searchText = '';
    if (editor && !editor.selection.isEmpty) {
      searchText = editor.document.getText(editor.selection);
    }

    if (!searchText) {
      const input = await vscode.window.showInputBox({
        prompt: `Enter text to search across ${favouriteProjects.length} favourite project(s)`,
        placeHolder: 'Search term'
      });

      if (!input) {
        return; // User cancelled
      }
      searchText = input;
    }

    // URL encode and quote the search text for exact match
    const quotedSearchText = `"${searchText}"`;
    const encodedSearchText = encodeURIComponent(quotedSearchText);

    // Build URL with repeated project parameters
    let searchUrl = `${baseUrl}/search?full=${encodedSearchText}`;
    for (const project of favouriteProjects) {
      searchUrl += `&project=${encodeURIComponent(project)}`;
    }

    const useIntegratedBrowser = config.get<boolean>('useIntegratedBrowser', false);

    // Open search results in browser
    if (useIntegratedBrowser) {
      try {
        await vscode.commands.executeCommand('simpleBrowser.show', searchUrl);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to open in Simple Browser: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Open Settings',
          'Use External Browser'
        ).then(selection => {
          if (selection === 'Open Settings') {
            vscode.commands.executeCommand(
              'workbench.action.openSettings',
              'opengrok-navigator.useIntegratedBrowser'
            );
          } else if (selection === 'Use External Browser') {
            vscode.env.openExternal(vscode.Uri.parse(searchUrl));
          }
        });
      }
    } else {
      await vscode.env.openExternal(vscode.Uri.parse(searchUrl));
    }
  }
);
```

---

## URL Length Considerations

OpenGrok instances behind proxies or application servers may have URL length limits (commonly 2048-8192 characters). With the repeated parameter format:

| Scenario | Approximate URL Length |
|----------|------------------------|
| 10 projects, 20-char names | ~400 chars |
| 50 projects, 20-char names | ~1500 chars |
| 100 projects, 30-char names | ~4000 chars |

**Mitigation:** For users with many favourites (50+), document recommendation to create multiple favourite lists or use "Search All Projects" instead. URL length errors from OpenGrok will provide clear feedback.

---

## Testing Plan

### Unit Tests

1. **Configuration reading**: Verify favourite projects array is correctly read from settings
2. **URL construction**: Verify multi-project URLs are correctly formatted
3. **Empty array handling**: Verify prompt appears when no favourites configured

### Manual Tests

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Basic search | Configure 3 favourites, select text, right-click → Search Favourite Projects | Browser opens with search scoped to 3 projects |
| Keyboard shortcut | Configure favourites, select text, press `Ctrl+Shift+G F` | Browser opens with search |
| Empty favourites | Remove all favourites, trigger command | Warning message with "Configure Favourites" action |
| Special characters | Add project name with spaces/special chars | URL properly encoded |
| Input box | Trigger command with no selection | Input box appears, search executes after input |

---

## Future Enhancements (Out of Scope)

1. **Sidebar search for favourites**: Add in-editor search results view for favourite projects
2. **Multiple favourite lists**: Named favourite groups (e.g., "Team A repos", "Infrastructure")
3. **Quick pick selection**: Command palette to select from saved favourite lists
4. **Project discovery**: Auto-suggest projects based on workspace structure
5. **Favourite management UI**: Tree view to add/remove favourites without editing JSON

---

## Summary

| Aspect | Decision |
|--------|----------|
| **URL format** | Repeated `project` parameter: `&project=p1&project=p2` |
| **Storage** | VS Code settings array: `opengrok-navigator.favouriteProjects` |
| **Empty handling** | Warning message with "Configure Favourites" action |
| **Search interface** | Browser-based (consistent with "Search All Projects") |
| **Keyboard shortcut** | `Ctrl+Shift+G F` / `Cmd+Shift+G F` |
| **Context menu** | "Search Favourite Projects in OpenGrok (Browser)" in navigation group |

---

## References

- [OpenGrok QueryParameters Javadoc](https://oracle.github.io/opengrok/javadoc/org/opengrok/indexer/web/QueryParameters.html) - Official parameter documentation
- [GitHub Issue #563](https://github.com/oracle/opengrok/issues/563) - Multi-project query string handling
- [OpenGrok Wiki - Features](https://github.com/oracle/opengrok/wiki/Features) - Search capabilities overview
