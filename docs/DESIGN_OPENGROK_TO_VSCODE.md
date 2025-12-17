# OpenGrok to VS Code Navigation - Design Document

## Problem Statement

Build a complementary solution to the existing OpenGrok Navigator extension that enables reverse navigation: from an OpenGrok browser session (Chrome) to VS Code. When a user is viewing source code in OpenGrok and clicks on a line number or selects a line, the corresponding file should open in VS Code at that exact line.

**User Story**: As a developer browsing code in OpenGrok, I want to quickly jump to the same file and line in my local VS Code workspace so I can edit or explore the code further without manually navigating.

## Requirements

### Core Requirements
1. Detect when user clicks/selects a line in OpenGrok web interface
2. Extract file path and line number from OpenGrok URL
3. Open the corresponding file in VS Code at the correct line
4. Work with existing VS Code windows/workspaces when possible

### Extended Requirements
1. Handle case where no VS Code workspace is open
2. Support multiple VS Code windows (select appropriate one)
3. Support project root mapping (OpenGrok project → local workspace)
4. Minimal user friction (ideally one-click operation)

## Solution Analysis

### Option 1: Chrome Extension + VS Code Extension (RECOMMENDED)

**Architecture**:
```
OpenGrok Browser (Chrome)
    ↓
Chrome Extension (content script + background)
    ↓
HTTP Request to Local Server
    ↓
VS Code Extension (HTTP server listening on localhost)
    ↓
VS Code Editor API
```

**Advantages**:
- ✅ Most robust and feature-rich solution
- ✅ Works seamlessly in the background
- ✅ Can handle workspace detection and selection
- ✅ Persistent configuration
- ✅ Can display notifications and errors to user
- ✅ No security warnings (localhost communication)
- ✅ Can enhance OpenGrok UI with visual indicators

**Disadvantages**:
- ❌ Requires two extensions to be installed
- ❌ More complex development/maintenance
- ❌ Requires VS Code extension to be running

**Implementation Complexity**: Medium-High

---

### Option 2: Bookmarklet + VS Code URI Handler

**Architecture**:
```
OpenGrok Browser
    ↓
Bookmarklet (JavaScript in bookmark)
    ↓
vscode:// URI scheme
    ↓
VS Code (built-in URI handler)
```

**Advantages**:
- ✅ Extremely lightweight (single bookmark)
- ✅ No extension installation required
- ✅ Works with VS Code's built-in URI handler
- ✅ Cross-browser compatible
- ✅ Easy to share/distribute

**Disadvantages**:
- ❌ Limited workspace detection (can't query open workspaces)
- ❌ Requires user to configure project root mappings manually
- ❌ No persistent configuration (must be in bookmarklet code)
- ❌ No error feedback mechanism
- ❌ Limited UI integration

**Implementation Complexity**: Low

---

### Option 3: Chrome Extension + VS Code URI Handler (HYBRID)

**Architecture**:
```
OpenGrok Browser (Chrome)
    ↓
Chrome Extension
    ↓
vscode:// URI scheme
    ↓
VS Code (built-in URI handler)
```

**Advantages**:
- ✅ Only requires Chrome extension (no VS Code extension needed)
- ✅ Persistent configuration in Chrome extension
- ✅ Better UI integration than bookmarklet
- ✅ Can enhance OpenGrok page with buttons/indicators
- ✅ Uses VS Code's standard URI handler

**Disadvantages**:
- ❌ Can't query open VS Code workspaces
- ❌ Limited error handling
- ❌ Less control over workspace selection

**Implementation Complexity**: Low-Medium

---

## Recommended Solution: Chrome Extension + VS Code URI Handler (UPDATED)

**This is the simplest and most practical approach.** After reconsidering the requirements, the `vscode://` URI scheme provides all the necessary functionality without the complexity of an HTTP server. VS Code doesn't even need to be running - the OS will launch it automatically when the URI is triggered.

### Why This is Better

1. **No VS Code extension required** - Uses VS Code's built-in URI handler
2. **Works even if VS Code isn't running** - The OS launches VS Code automatically
3. **Much simpler implementation** - Only need a Chrome extension
4. **Zero maintenance on VS Code side** - No server, no ports, no conflicts
5. **Still supports persistent configuration** - Chrome extension stores project mappings
6. **Better UX for most users** - "It just works"

The only limitation compared to the HTTP server approach is that you can't query which workspaces are currently open, but in practice this doesn't matter - VS Code is smart enough to open the file in an appropriate window or create a new one if needed.

### Architecture Details

#### Chrome Extension (Complete Implementation)

**Manifest (manifest.json)**:
```json
{
  "manifest_version": 3,
  "name": "OpenGrok to VS Code",
  "version": "1.0.0",
  "description": "Open OpenGrok files in VS Code with one click",
  "permissions": [
    "activeTab",
    "storage",
    "contextMenus"
  ],
  "content_scripts": [
    {
      "matches": ["*://*/source/xref/*"],
      "js": ["content.js"],
      "css": ["content.css"]
    }
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "commands": {
    "open-current-line": {
      "suggested_key": {
        "default": "Ctrl+Shift+O",
        "mac": "Command+Shift+O"
      },
      "description": "Open current line in VS Code"
    },
    "open-current-file": {
      "suggested_key": {
        "default": "Ctrl+Shift+F",
        "mac": "Command+Shift+F"
      },
      "description": "Open current file (line 1) in VS Code"
    }
  },
  "options_page": "options.html"
}
```

**Content Script (content.js)**:
Runs on OpenGrok pages and enhances the UI with multiple interaction methods.

```javascript
// Parse OpenGrok URL to extract file path and line number
function parseOpenGrokUrl() {
  const url = window.location.href;
  // URL format: http://host/source/xref/PROJECT/path/to/file.ext#123

  const match = url.match(/\/xref\/([^/]+)\/(.+?)(?:#(\d+))?$/);
  if (!match) return null;

  return {
    project: match[1],
    filePath: match[2].replace(/#.*$/, ''), // Remove anchor if in path
    lineNumber: match[3] || window.location.hash.replace('#', '') || '1'
  };
}

// Global state for preview
let previewTimeout = null;
let currentPreview = null;

// Create floating preview on hover
function createPreview(lineNumber, targetElement) {
  const parsed = parseOpenGrokUrl();
  if (!parsed) return null;

  const preview = document.createElement('div');
  preview.className = 'vscode-preview';
  preview.innerHTML = `
    <div class="vscode-preview-header">
      <strong>Line ${lineNumber}</strong>
      <button class="vscode-preview-close" title="Close">×</button>
    </div>
    <div class="vscode-preview-body">
      <div class="vscode-preview-info">
        <small><strong>Project:</strong> ${parsed.project}</small><br>
        <small><strong>File:</strong> ${parsed.filePath}</small>
      </div>
      <button class="vscode-preview-open">Open in VS Code</button>
    </div>
  `;

  // Position near the line number
  const rect = targetElement.getBoundingClientRect();
  preview.style.position = 'fixed';
  preview.style.left = `${Math.min(rect.right + 10, window.innerWidth - 320)}px`;
  preview.style.top = `${Math.min(rect.top, window.innerHeight - 150)}px`;

  document.body.appendChild(preview);

  // Add event listeners
  preview.querySelector('.vscode-preview-open').addEventListener('click', () => {
    openInVSCode(lineNumber);
    removePreview();
  });

  preview.querySelector('.vscode-preview-close').addEventListener('click', removePreview);

  // Keep preview open when hovering over it
  preview.addEventListener('mouseenter', () => {
    clearTimeout(previewTimeout);
  });

  preview.addEventListener('mouseleave', () => {
    previewTimeout = setTimeout(removePreview, 300);
  });

  return preview;
}

function removePreview() {
  if (currentPreview) {
    currentPreview.remove();
    currentPreview = null;
  }
}

// Add "Open in VS Code" functionality to line numbers
function enhanceUI() {
  // OpenGrok line numbers are in <a> tags with class "l"
  const lineNumbers = document.querySelectorAll('a.l');

  lineNumbers.forEach(anchor => {
    // Add tooltip
    anchor.title = 'Ctrl+Click to open in VS Code, or hover for options';
    anchor.style.cursor = 'pointer';

    // Ctrl+Click handler
    anchor.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const lineNum = anchor.textContent.trim();
        openInVSCode(lineNum);
      }
    });

    // Hover preview handler
    anchor.addEventListener('mouseenter', (e) => {
      const lineNum = anchor.textContent.trim();
      previewTimeout = setTimeout(() => {
        removePreview(); // Remove any existing preview
        currentPreview = createPreview(lineNum, anchor);
      }, 500); // 500ms delay
    });

    anchor.addEventListener('mouseleave', () => {
      clearTimeout(previewTimeout);
      // Remove preview after a delay to allow moving mouse to preview
      previewTimeout = setTimeout(() => {
        if (currentPreview && !currentPreview.matches(':hover')) {
          removePreview();
        }
      }, 300);
    });
  });

  // Add floating button for current view
  const button = document.createElement('button');
  button.id = 'vscode-open-button';
  button.textContent = 'Open in VS Code';
  button.className = 'vscode-open-btn';
  document.body.appendChild(button);

  button.addEventListener('click', () => {
    openInVSCode();
  });
}

// Send request to VS Code via background script
function openInVSCode(lineNumber = null) {
  const parsed = parseOpenGrokUrl();
  if (!parsed) {
    alert('Could not parse OpenGrok URL');
    return;
  }

  if (lineNumber) {
    parsed.lineNumber = lineNumber;
  }

  // Send message to background script
  chrome.runtime.sendMessage({
    action: 'openInVSCode',
    data: parsed
  }, (response) => {
    if (response && response.error) {
      alert(`Error: ${response.error}`);
    }
  });
}

// Handle keyboard shortcut messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'keyboardShortcut') {
    if (message.command === 'open-current-line') {
      // Get current line from URL hash
      const hash = window.location.hash.replace('#', '');
      openInVSCode(hash || '1');
    } else if (message.command === 'open-current-file') {
      openInVSCode('1');
    }
    sendResponse({ success: true });
  } else if (message.action === 'openInVSCode') {
    // Called from context menu
    openInVSCode(message.lineNumber);
    sendResponse({ success: true });
  }
  return true;
});

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceUI);
} else {
  enhanceUI();
}
```

**Background Script (background.js)**:
Constructs VS Code URI, manages context menus, and handles keyboard shortcuts.

```javascript
// Load configuration from storage
async function getConfig() {
  const result = await chrome.storage.sync.get({
    projectMappings: {},
    defaultWorkspaceRoot: '' // Optional: fallback root directory
  });
  return result;
}

// Open file in VS Code using vscode:// URI scheme
async function openInVSCode(data) {
  const config = await getConfig();

  // Get workspace root from project mapping
  let workspaceRoot = config.projectMappings[data.project];

  if (!workspaceRoot) {
    // Try default workspace root if configured
    if (config.defaultWorkspaceRoot) {
      workspaceRoot = `${config.defaultWorkspaceRoot}/${data.project}`;
    } else {
      return {
        error: `No mapping found for project: ${data.project}. Please configure in extension options.`
      };
    }
  }

  // Construct local file path
  const localPath = `${workspaceRoot}/${data.filePath}`;

  // Construct VS Code URI: vscode://file/ABSOLUTE_PATH:LINE:COLUMN
  const vscodeUri = `vscode://file/${localPath}:${data.lineNumber}:1`;

  console.log('Opening in VS Code:', vscodeUri);

  // Open the URI - this will launch VS Code or bring it to focus
  try {
    await chrome.tabs.create({ url: vscodeUri, active: false });
    // Close the tab immediately - it's just used to trigger the protocol handler
    const tabs = await chrome.tabs.query({ url: vscodeUri });
    if (tabs.length > 0) {
      await chrome.tabs.remove(tabs[0].id);
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to open VS Code URI:', error);
    return { error: error.message };
  }
}

// Create context menus on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('OpenGrok to VS Code extension installed');

  // Context menu for line number links
  chrome.contextMenus.create({
    id: 'open-line-in-vscode',
    title: 'Open in VS Code',
    contexts: ['link'],
    targetUrlPatterns: ['*://*/source/xref/*#*'],
    documentUrlPatterns: ['*://*/source/xref/*']
  });

  // Context menu when text is selected
  chrome.contextMenus.create({
    id: 'search-in-vscode',
    title: 'Search "%s" in VS Code',
    contexts: ['selection'],
    documentUrlPatterns: ['*://*/source/xref/*']
  });

  // Context menu for the page (any click on OpenGrok file view)
  chrome.contextMenus.create({
    id: 'open-file-in-vscode',
    title: 'Open current file in VS Code',
    contexts: ['page'],
    documentUrlPatterns: ['*://*/source/xref/*']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-line-in-vscode') {
    // Extract line number from the link URL
    const match = info.linkUrl.match(/#(\d+)/);
    const lineNumber = match ? match[1] : '1';

    // Send to content script to trigger open
    chrome.tabs.sendMessage(tab.id, {
      action: 'openInVSCode',
      lineNumber: lineNumber
    });
  } else if (info.menuItemId === 'search-in-vscode') {
    // Future enhancement: trigger VS Code search
    // For now, just show a message
    const searchText = info.selectionText;
    console.log('Search feature coming soon:', searchText);
    // Could use: vscode://search?query=text
  } else if (info.menuItemId === 'open-file-in-vscode') {
    // Open file at line 1
    chrome.tabs.sendMessage(tab.id, {
      action: 'openInVSCode',
      lineNumber: '1'
    });
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'keyboardShortcut',
        command: command
      });
    }
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openInVSCode') {
    openInVSCode(message.data).then(sendResponse);
    return true; // Keep channel open for async response
  }
});
```

**Options Page (options.html)**:
Configuration UI for project mappings.

```html
<!DOCTYPE html>
<html>
<head>
  <title>OpenGrok to VS Code - Settings</title>
  <style>
    body {
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 600px;
    }
    h1 { font-size: 20px; margin-bottom: 20px; }
    h2 { font-size: 16px; margin-top: 30px; margin-bottom: 10px; }
    .mapping {
      display: flex;
      gap: 10px;
      margin: 10px 0;
      align-items: center;
    }
    .mapping input {
      flex: 1;
      padding: 6px;
      border: 1px solid #ccc;
      border-radius: 3px;
    }
    .mapping button {
      padding: 6px 12px;
      background: #dc3545;
      color: white;
      border: none;
      border-radius: 3px;
      cursor: pointer;
    }
    .mapping button:hover { background: #c82333; }
    button {
      padding: 8px 16px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 3px;
      cursor: pointer;
    }
    button:hover { background: #0056b3; }
    .add-btn { background: #28a745; }
    .add-btn:hover { background: #218838; }
    #status {
      margin-left: 10px;
      color: #28a745;
      font-weight: bold;
    }
    .hint {
      color: #666;
      font-size: 12px;
      margin-top: 5px;
    }
    .section {
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <h1>OpenGrok to VS Code - Settings</h1>

  <div class="section">
    <h2>Default Workspace Root (Optional)</h2>
    <input type="text" id="defaultWorkspaceRoot" placeholder="/Users/yourname/projects" style="width: 100%;" />
    <div class="hint">
      If set, projects without explicit mappings will use: {root}/{project}
    </div>
  </div>

  <h2>Project Mappings</h2>
  <div class="hint" style="margin-bottom: 15px;">
    Map OpenGrok project names to local workspace directories
  </div>
  <div id="mappings"></div>
  <button class="add-btn" id="addMapping">+ Add Mapping</button>

  <br><br>
  <button id="save">Save Settings</button>
  <span id="status"></span>

  <script src="options.js"></script>
</body>
</html>
```

**Options Script (options.js)**:

```javascript
// Load saved settings
async function loadSettings() {
  const result = await chrome.storage.sync.get({
    projectMappings: {},
    defaultWorkspaceRoot: ''
  });

  document.getElementById('defaultWorkspaceRoot').value = result.defaultWorkspaceRoot;

  const mappingsDiv = document.getElementById('mappings');
  mappingsDiv.innerHTML = '';

  for (const [project, path] of Object.entries(result.projectMappings)) {
    addMappingRow(project, path);
  }

  // Add empty row if no mappings
  if (Object.keys(result.projectMappings).length === 0) {
    addMappingRow('', '');
  }
}

// Add a mapping row to the UI
function addMappingRow(project = '', path = '') {
  const mappingsDiv = document.getElementById('mappings');
  const row = document.createElement('div');
  row.className = 'mapping';

  const projectInput = document.createElement('input');
  projectInput.type = 'text';
  projectInput.placeholder = 'Project name (e.g., illumos-gate)';
  projectInput.value = project;

  const pathInput = document.createElement('input');
  pathInput.type = 'text';
  pathInput.placeholder = 'Absolute path (e.g., /Users/yourname/projects/illumos-gate)';
  pathInput.value = path;

  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove';
  removeBtn.onclick = () => row.remove();

  row.appendChild(projectInput);
  row.appendChild(pathInput);
  row.appendChild(removeBtn);
  mappingsDiv.appendChild(row);
}

// Save settings
async function saveSettings() {
  const mappings = {};
  const rows = document.querySelectorAll('.mapping');

  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const project = inputs[0].value.trim();
    const path = inputs[1].value.trim();

    if (project && path) {
      mappings[project] = path;
    }
  });

  const defaultRoot = document.getElementById('defaultWorkspaceRoot').value.trim();

  await chrome.storage.sync.set({
    projectMappings: mappings,
    defaultWorkspaceRoot: defaultRoot
  });

  // Show success message
  const status = document.getElementById('status');
  status.textContent = 'Settings saved!';
  setTimeout(() => status.textContent = '', 2000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  document.getElementById('addMapping').addEventListener('click', () => addMappingRow());
  document.getElementById('save').addEventListener('click', saveSettings);
});
```

**CSS (content.css)**:
Styles for the floating button and hover preview on OpenGrok pages.

```css
/* Floating "Open in VS Code" button */
.vscode-open-btn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 10000;
  padding: 12px 20px;
  background: #007acc;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: background 0.2s, transform 0.1s;
}

.vscode-open-btn:hover {
  background: #005a9e;
}

.vscode-open-btn:active {
  transform: scale(0.98);
}

/* Hover preview popup */
.vscode-preview {
  position: fixed;
  z-index: 10001;
  background: white;
  border: 1px solid #ccc;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  width: 300px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  overflow: hidden;
  animation: fadeIn 0.15s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.vscode-preview-header {
  background: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.vscode-preview-header strong {
  color: #333;
  font-size: 14px;
}

.vscode-preview-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #666;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  transition: background 0.2s;
}

.vscode-preview-close:hover {
  background: #e0e0e0;
  color: #333;
}

.vscode-preview-body {
  padding: 12px;
}

.vscode-preview-info {
  margin-bottom: 12px;
  color: #666;
  line-height: 1.6;
}

.vscode-preview-info strong {
  color: #333;
}

.vscode-preview-open {
  width: 100%;
  padding: 8px 12px;
  background: #007acc;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.vscode-preview-open:hover {
  background: #005a9e;
}

.vscode-preview-open:active {
  transform: scale(0.98);
}
```

---

## Alternative: Simpler Bookmarklet Solution

For users who want a lightweight solution without extensions:

```javascript
javascript:(function(){
  const url = window.location.href;
  const match = url.match(/\/xref\/([^/]+)\/(.+?)(?:#(\d+))?$/);
  if (!match) {
    alert('Not an OpenGrok file view');
    return;
  }

  const project = match[1];
  const filePath = match[2].replace(/#.*$/, '');
  const lineNumber = match[3] || window.location.hash.replace('#', '') || '1';

  // Construct VS Code URI
  // vscode://file/ABSOLUTE_PATH:LINE:COLUMN

  // User must configure this mapping
  const projectRoots = {
    'illumos-gate': '/Users/yourname/projects/illumos-gate',
    'another-project': '/Users/yourname/projects/another'
  };

  const root = projectRoots[project];
  if (!root) {
    alert(`Unknown project: ${project}. Configure projectRoots in bookmarklet.`);
    return;
  }

  const localPath = `${root}/${filePath}`;
  const vscodeUrl = `vscode://file/${localPath}:${lineNumber}:1`;

  window.location.href = vscodeUrl;
})();
```

**To install**: Create a bookmark and paste the above code as the URL.

---

## Implementation Recommendations

### Phase 1: Proof of Concept (30 minutes)
1. Build the bookmarklet version first
2. Test with your OpenGrok instance
3. Validate the URL parsing and path mapping logic

### Phase 2: Chrome Extension (2-3 hours)
1. Create extension manifest and basic structure
2. Implement content script for UI enhancements
3. Implement background script for URI handling
4. Test against various OpenGrok pages

### Phase 3: Configuration UI (1-2 hours)
1. Create options page for project mappings
2. Add save/load functionality
3. Test configuration persistence

### Phase 4: Polish (1-2 hours)
1. Add error handling and user notifications
2. Improve UI styling
3. Add floating "Open in VS Code" button
4. Write README and publish to Chrome Web Store

**Total Estimated Time**: 4-7 hours (much simpler than HTTP server approach!)

---

## Chrome Extension Development Guide

### Directory Structure

Recommended folder structure for the Chrome extension:

```
opengrok-navigator/
├── vscode-extension/          # VS Code extension (existing code)
│   ├── src/
│   │   └── extension.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
├── chrome-extension/          # NEW: Chrome extension
│   ├── manifest.json
│   ├── content.js
│   ├── background.js
│   ├── options.html
│   ├── options.js
│   ├── content.css
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── README.md
├── DESIGN_OPENGROK_TO_VSCODE.md
└── README.md                  # Root README linking to both extensions
```

### Building and Packaging

#### Step 1: Create Icons

Chrome Web Store requires icons in multiple sizes:
- 16x16: Toolbar icon
- 48x48: Extension management page
- 128x128: Chrome Web Store

You can create simple icons or use VS Code's logo (with proper attribution). Tools:
- Use an online icon generator
- Use Figma/Sketch/Inkscape
- Convert SVG to PNG: `convert -density 300 icon.svg -resize 128x128 icon128.png`

#### Step 2: Development Testing

1. **Load Unpacked Extension**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `chrome-extension` directory
   - Extension is now installed locally

2. **Testing Changes**:
   - After code changes, click the refresh icon on the extension card
   - For manifest changes, you may need to reload the extension entirely
   - Use Chrome DevTools to debug:
     - **Content script**: Right-click on OpenGrok page → Inspect → Console tab
     - **Background script**: `chrome://extensions/` → Click "Inspect views: service worker"
     - **Options page**: Right-click extension icon → Options → Right-click page → Inspect

3. **Common Development Mistakes**:

   ⚠️ **Service Worker vs Background Page**:
   - Manifest V3 uses service workers (not persistent background pages)
   - Service workers can be terminated when idle
   - Don't rely on global state persisting forever
   - Use `chrome.storage` for persistence

   ⚠️ **Content Script Limitations**:
   - Content scripts can't use all Chrome APIs (e.g., no `chrome.tabs`)
   - Must message the background script for privileged operations
   - Can't access `window` object directly (need to inject scripts)

   ⚠️ **Async Message Passing**:
   - MUST return `true` from `onMessage` listener if sending async response
   - Otherwise response channel closes immediately
   ```javascript
   chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
     doAsyncWork().then(sendResponse);
     return true; // ← CRITICAL!
   });
   ```

   ⚠️ **CSP Restrictions**:
   - Can't use inline scripts in HTML (`<script>` tags must have `src`)
   - Can't use `eval()` or `new Function()`
   - Can't use inline event handlers (`onclick="..."`)

   ⚠️ **Storage Limits**:
   - `chrome.storage.sync`: 100KB total, 8KB per item
   - `chrome.storage.local`: 5MB total (10MB with permission)
   - Check quotas: `chrome.storage.sync.getBytesInUse()`

   ⚠️ **Protocol Handler Quirks**:
   - `chrome.tabs.create()` with `vscode://` URL may show empty tab briefly
   - Must close tab after opening to avoid clutter
   - Some browsers require user gesture to trigger protocol handlers

#### Step 3: Testing on Real OpenGrok

Test with various URL patterns:
```
http://localhost:8080/source/xref/project/file.c#123
https://opengrok.company.com/source/xref/project/path/to/file.java#456
http://opengrok/xref/multi-word-project/src/main.cpp#1
```

Test edge cases:
- Files with no line number (use line 1)
- Files with special characters in path (`#`, `?`, `&`)
- Projects with hyphens, underscores, dots
- Very long file paths
- Projects with no mapping configured

#### Step 4: Packaging for Distribution

1. **Prepare for Production**:
   - Remove `console.log()` statements (or make conditional)
   - Test all features thoroughly
   - Update version in `manifest.json`
   - Write clear `README.md` with setup instructions

2. **Create ZIP Package**:
   ```bash
   cd chrome-extension
   zip -r opengrok-to-vscode.zip . -x "*.DS_Store" -x "__MACOSX/*"
   ```

3. **Chrome Web Store Submission**:
   - Developer registration fee: $5 (one-time)
   - Required assets:
     - Extension ZIP file
     - Detailed description (at least 132 characters)
     - Screenshots (1280x800 or 640x400)
     - Promotional images (optional but recommended)
     - Privacy policy (if handling user data)
   - Review process: Usually 1-3 days
   - Update link: https://chrome.google.com/webstore/devconsole

4. **Alternative: Private Distribution**:
   - Share ZIP file directly
   - Users install via "Load unpacked" (requires developer mode)
   - Or use enterprise policy for managed deployment

### Common Pitfalls and Solutions

| Problem | Cause | Solution |
|---------|-------|----------|
| "Service worker inactive" | Service worker terminated | Normal - Chrome restarts on demand |
| Content script not running | URL pattern mismatch | Check `matches` in manifest |
| Storage not persisting | Using local variables | Use `chrome.storage.sync` |
| "Cannot read response" | Async response without `return true` | Always return `true` for async |
| Extension not updating | Old code cached | Hard reload extension card |
| Protocol handler not working | Browser security | Test with user gesture (button click) |
| Icons not showing | Wrong path/size | Check paths and icon dimensions |

### Debugging Tips

1. **Check Background Service Worker**:
   ```javascript
   console.log('Background script loaded');
   chrome.runtime.onInstalled.addListener(() => {
     console.log('Extension installed/updated');
   });
   ```

2. **Verify Storage**:
   ```javascript
   chrome.storage.sync.get(null, (items) => {
     console.log('All stored data:', items);
   });
   ```

3. **Test Message Passing**:
   ```javascript
   // In content script
   chrome.runtime.sendMessage({test: true}, (response) => {
     console.log('Got response:', response);
   });
   ```

4. **Monitor Protocol Handler**:
   - Check if VS Code actually launches
   - Look for OS-level notifications/prompts
   - Test with simple URI: `vscode://file//tmp/test.txt:1:1`

---

## API References

### VS Code Extension API

**Opening Files**:
```typescript
// Open document
const uri = vscode.Uri.file(filePath);
const document = await vscode.workspace.openTextDocument(uri);
const editor = await vscode.window.showTextDocument(document);

// Navigate to line (0-based indexing)
const position = new vscode.Position(lineNumber - 1, 0);
editor.selection = new vscode.Selection(position, position);
editor.revealRange(
  new vscode.Range(position, position),
  vscode.TextEditorRevealType.InCenterIfOutsideViewport
);
```

**Workspace Access**:
```typescript
const workspaceFolders = vscode.workspace.workspaceFolders;
if (workspaceFolders) {
  workspaceFolders.forEach(folder => {
    console.log(folder.name, folder.uri.fsPath);
  });
}
```

**HTTP Server** (Node.js built-in):
```typescript
import * as http from 'http';

const server = http.createServer((req, res) => {
  // Handle request
});

server.listen(port, 'localhost', () => {
  console.log(`Server listening on port ${port}`);
});
```

### Chrome Extension API

**Storage**:
```javascript
// Save
chrome.storage.sync.set({ key: value });

// Load
const result = await chrome.storage.sync.get(['key']);
console.log(result.key);
```

**Messaging**:
```javascript
// Content script → Background
chrome.runtime.sendMessage({ action: 'doSomething' }, response => {
  console.log(response);
});

// Background listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'doSomething') {
    // Do work
    sendResponse({ result: 'done' });
  }
  return true; // Keep channel open for async
});
```

**Fetch from Background**:
```javascript
fetch('http://localhost:37100/open', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

### VS Code URI Handler

VS Code supports `vscode://` URIs for external activation:

```
vscode://file/ABSOLUTE_PATH:LINE:COLUMN
```

Example:
```
vscode://file//Users/alice/project/src/main.ts:42:5
```

**Note**: This opens the file but doesn't guarantee which workspace/window. The HTTP server approach provides more control.

---

## Configuration Example

**Chrome Extension Settings** (configured via options page, stored in `chrome.storage.sync`):

```json
{
  "defaultWorkspaceRoot": "/Users/alan/projects",
  "projectMappings": {
    "illumos-gate": "/Users/alan/projects/illumos-gate",
    "opengrok-navigator": "/Users/alan/rc/opengrok-navigator",
    "linux-kernel": "/Users/alan/projects/linux"
  }
}
```

**How it works**:
1. User visits OpenGrok file: `http://opengrok/source/xref/illumos-gate/usr/src/uts/common/fs/zfs/zfs_ioctl.c#456`
2. Extension parses project: `illumos-gate`, path: `usr/src/uts/common/fs/zfs/zfs_ioctl.c`, line: `456`
3. Looks up mapping: `/Users/alan/projects/illumos-gate`
4. Constructs URI: `vscode://file//Users/alan/projects/illumos-gate/usr/src/uts/common/fs/zfs/zfs_ioctl.c:456:1`
5. Opens in VS Code automatically (launches if not running)

---

## Security Considerations

1. **Chrome Extension Permissions**: Requests minimal permissions (only `activeTab`, `storage`)
2. **Local Protocol Handler**: Uses OS-level `vscode://` protocol handler - no network communication
3. **Path Security**: All paths are configured by the user in extension options
4. **No Remote Access**: Everything happens locally - browser → OS → VS Code
5. **User Control**: User must explicitly click to open files in VS Code

---

## Testing Strategy

1. **Unit Tests**: Test URL parsing logic with various OpenGrok URL formats
2. **Manual Testing**: Test with real OpenGrok instance
3. **Edge Cases**:
   - Files in nested directories
   - Files with special characters in paths
   - Line numbers at start/end of file
   - Multiple VS Code windows open
   - No VS Code workspace open
   - File doesn't exist locally
4. **Browser Compatibility**: Test in Chrome, Edge (Chromium)

---

## Repository Migration Plan

### Current Structure
```
opengrok-navigator/
├── src/
│   └── extension.ts       # 742 lines
├── package.json
├── tsconfig.json
├── .vscode/
├── .vscodeignore
├── CLAUDE.md
├── README.md
└── [other VS Code extension files]
```

### Target Structure
```
opengrok-navigator/
├── vscode-extension/           # Moved VS Code extension
│   ├── src/
│   │   └── extension.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── .vscodeignore
│   └── README.md
├── chrome-extension/           # New Chrome extension
│   ├── manifest.json
│   ├── content.js
│   ├── background.js
│   ├── options.html
│   ├── options.js
│   ├── content.css
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── README.md
├── .vscode/                    # Keep at root for development
├── CLAUDE.md                   # Keep at root (update paths)
├── DESIGN_OPENGROK_TO_VSCODE.md
└── README.md                   # Root README linking to both
```

### Migration Steps

#### Step 1: Create New Structure (5 minutes)
```bash
# From repository root
mkdir vscode-extension chrome-extension

# Move VS Code extension files
mv src vscode-extension/
mv package.json vscode-extension/
mv tsconfig.json vscode-extension/
mv .vscodeignore vscode-extension/
cp README.md vscode-extension/README.md

# Update root README to link to sub-extensions
```

#### Step 2: Update VS Code Extension Config (5 minutes)

**Update vscode-extension/package.json**:
- Verify all paths still work (they should, as they're relative)
- Update `repository` URL if needed
- Test compilation: `cd vscode-extension && npm install && npm run compile`

**Update CLAUDE.md** (update all file paths):
```markdown
# Old paths
[src/extension.ts](src/extension.ts)

# New paths
[vscode-extension/src/extension.ts](vscode-extension/src/extension.ts)
```

#### Step 3: Create Chrome Extension (2-3 hours)

Copy the code from the design document into `chrome-extension/` directory:
1. Create `manifest.json`
2. Create `content.js`, `background.js`, `options.html`, `options.js`, `content.css`
3. Generate icons (or use placeholders initially)
4. Create `chrome-extension/README.md` with setup instructions

#### Step 4: Update Root README (15 minutes)

```markdown
# OpenGrok Navigator

Bidirectional navigation between OpenGrok and VS Code.

## Components

### [VS Code Extension](vscode-extension/)
Navigate from VS Code to OpenGrok in your browser.

**Features**:
- Open current file/line in OpenGrok
- Search OpenGrok and display results in VS Code
- Copy OpenGrok URLs to clipboard

[See VS Code extension README →](vscode-extension/README.md)

### [Chrome Extension](chrome-extension/)
Navigate from OpenGrok in Chrome back to VS Code.

**Features**:
- Open OpenGrok files in VS Code with one click
- Ctrl+Click line numbers to jump to VS Code
- Configurable project mappings

[See Chrome extension README →](chrome-extension/README.md)

## Installation

Install both extensions for bidirectional navigation, or just one for single-direction workflow.
```

#### Step 5: Test and Commit (15 minutes)

```bash
# Test VS Code extension
cd vscode-extension
npm install
npm run compile
# Press F5 to test in Extension Development Host

# Test Chrome extension
# Load chrome-extension/ as unpacked extension in Chrome

# Commit changes
git add .
git commit -m "Reorganize: separate VS Code and Chrome extensions

- Move VS Code extension to vscode-extension/ subdirectory
- Add Chrome extension in chrome-extension/ subdirectory
- Update documentation with new structure
- Add design document for OpenGrok → VS Code navigation"
```

### Potential Issues and Solutions

| Issue | Solution |
|-------|----------|
| VS Code extension breaks | Check paths in package.json, especially `main` entry |
| npm scripts fail | Update working directory or script paths |
| .vscodeignore excludes wrong files | Update patterns for new directory structure |
| Git history looks messy | Use `git mv` instead of `mv` for better history tracking |

### Alternative: Monorepo with Workspace

If you prefer a monorepo structure:

**package.json** (root):
```json
{
  "name": "opengrok-navigator-monorepo",
  "private": true,
  "workspaces": [
    "vscode-extension",
    "chrome-extension"
  ],
  "scripts": {
    "build:vscode": "npm run compile --workspace=vscode-extension",
    "build:chrome": "cd chrome-extension && zip -r ../opengrok-to-vscode.zip .",
    "build": "npm run build:vscode && npm run build:chrome"
  }
}
```

This allows running `npm install` at root to install all dependencies.

---

## Additional Feature Suggestions

### Feature 1: Smart Context Menu Integration ⭐⭐⭐ (Highest Priority)

**What**: Add context menu when right-clicking on OpenGrok page elements.

**Why**:
- More discoverable than Ctrl+Click or floating button
- Natural browser UX pattern
- Can offer multiple actions in one place

**Implementation**:

Update `manifest.json`:
```json
{
  "permissions": ["activeTab", "storage", "contextMenus"],
  "background": {
    "service_worker": "background.js"
  }
}
```

Update `background.js`:
```javascript
// Create context menus on installation
chrome.runtime.onInstalled.addListener(() => {
  // Menu when clicking line numbers
  chrome.contextMenus.create({
    id: 'open-line-in-vscode',
    title: 'Open line %s in VS Code',
    contexts: ['link'],
    targetUrlPatterns: ['*://*/source/xref/*']
  });

  // Menu when selecting text (to search in VS Code)
  chrome.contextMenus.create({
    id: 'search-in-vscode',
    title: 'Search "%s" in VS Code',
    contexts: ['selection'],
    targetUrlPatterns: ['*://*/source/xref/*']
  });

  // Menu for current file
  chrome.contextMenus.create({
    id: 'open-file-in-vscode',
    title: 'Open current file in VS Code',
    contexts: ['page'],
    targetUrlPatterns: ['*://*/source/xref/*']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-line-in-vscode') {
    // Extract line from URL
    const match = info.linkUrl.match(/#(\d+)/);
    const lineNumber = match ? match[1] : '1';
    // Send to content script to open
    chrome.tabs.sendMessage(tab.id, {
      action: 'openInVSCode',
      lineNumber: lineNumber
    });
  } else if (info.menuItemId === 'search-in-vscode') {
    // Open VS Code with search command
    const searchText = info.selectionText;
    // vscode://file/workspace-path?search=text
    // Or trigger VS Code search via command
  }
});
```

**Benefits**:
- Right-click line numbers → "Open line N in VS Code"
- Right-click selected code → "Search 'functionName' in VS Code"
- Right-click page → "Open current file in VS Code"
- More intuitive than hidden keyboard shortcuts

**Effort**: 1-2 hours

---

### Feature 2: Quick Peek Preview ⭐⭐ (Medium Priority)

**What**: Hover over a line number to see a floating preview with "Open in VS Code" button.

**Why**:
- Non-intrusive (doesn't add permanent UI)
- Shows only when user is interested
- Can display helpful info (file path, mapped workspace)

**Implementation**:

Update `content.js`:
```javascript
let previewTimeout = null;
let currentPreview = null;

function createPreview(lineNumber, targetElement) {
  // Create floating preview
  const preview = document.createElement('div');
  preview.className = 'vscode-preview';
  preview.innerHTML = `
    <div class="vscode-preview-header">
      <strong>Line ${lineNumber}</strong>
      <button class="vscode-preview-close">×</button>
    </div>
    <div class="vscode-preview-body">
      <div class="vscode-preview-info">
        <small>Project: ${currentProject}</small><br>
        <small>File: ${currentFilePath}</small>
      </div>
      <button class="vscode-preview-open">Open in VS Code</button>
    </div>
  `;

  // Position near the line number
  const rect = targetElement.getBoundingClientRect();
  preview.style.left = `${rect.right + 10}px`;
  preview.style.top = `${rect.top}px`;

  document.body.appendChild(preview);

  // Add event listeners
  preview.querySelector('.vscode-preview-open').addEventListener('click', () => {
    openInVSCode(lineNumber);
    removePreview();
  });

  preview.querySelector('.vscode-preview-close').addEventListener('click', removePreview);

  return preview;
}

function removePreview() {
  if (currentPreview) {
    currentPreview.remove();
    currentPreview = null;
  }
}

// Add hover listeners to line numbers
document.querySelectorAll('a.l').forEach(anchor => {
  anchor.addEventListener('mouseenter', (e) => {
    const lineNum = anchor.textContent.trim();
    previewTimeout = setTimeout(() => {
      currentPreview = createPreview(lineNum, anchor);
    }, 500); // 500ms delay
  });

  anchor.addEventListener('mouseleave', () => {
    clearTimeout(previewTimeout);
    // Remove preview after a delay to allow moving mouse to preview
    setTimeout(() => {
      if (currentPreview && !currentPreview.matches(':hover')) {
        removePreview();
      }
    }, 200);
  });
});
```

**Benefits**:
- Shows file path and project mapping
- Confirm correct workspace before opening
- Can add "Copy path" or "Open in new window" options
- Less visual clutter than permanent buttons

**Effort**: 2-3 hours

---

### Feature 3: Keyboard Shortcut Support ⭐⭐ (Medium Priority)

**What**: Global keyboard shortcuts for common actions.

**Why**:
- Power users prefer keyboard shortcuts
- Faster than mouse interactions
- Matches VS Code's keyboard-first philosophy

**Implementation**:

Update `manifest.json`:
```json
{
  "commands": {
    "open-current-line": {
      "suggested_key": {
        "default": "Ctrl+Shift+O",
        "mac": "Command+Shift+O"
      },
      "description": "Open current line in VS Code"
    },
    "open-current-file": {
      "suggested_key": {
        "default": "Ctrl+Shift+F",
        "mac": "Command+Shift+F"
      },
      "description": "Open current file (line 1) in VS Code"
    }
  }
}
```

Update `background.js`:
```javascript
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'keyboardShortcut',
      command: command
    });
  });
});
```

**Benefits**:
- `Ctrl+Shift+O`: Open current line in VS Code
- `Ctrl+Shift+F`: Open file at line 1
- Configurable in `chrome://extensions/shortcuts`
- Familiar for keyboard-centric users

**Effort**: 1 hour

---

### Recommended Priority

1. **Context Menu Integration** (⭐⭐⭐) - Most impactful, improves discoverability
2. **Keyboard Shortcuts** (⭐⭐) - Quick to implement, high value for power users
3. **Quick Peek Preview** (⭐⭐) - Nice UX but more complex

**Start with**: Context menu + Keyboard shortcuts (combined: 2-3 hours)

---

## Future Enhancements

1. **Multi-workspace Selection**: Show quick-pick menu when multiple workspaces match
2. **File Not Found Handling**: Offer to clone repository or show search results
3. **Firefox Support**: Port Chrome extension to Firefox (different manifest format)
4. **History Tracking**: Remember recently opened files
5. **Bi-directional Sync**: Show OpenGrok link in VS Code status bar for current file
6. **Symbol Navigation**: Support jumping to specific symbols, not just lines
7. **Batch Operations**: Select multiple files/lines and open all in VS Code
8. **Settings Sync**: Export/import project mappings as JSON

---

## Comparison Matrix

| Feature | Bookmarklet | Chrome Ext + URI (RECOMMENDED) | Chrome + VS Code Ext |
|---------|-------------|-------------------------------|----------------------|
| Installation Effort | ⭐⭐⭐ Minimal | ⭐⭐ Low | ⭐ Medium |
| Works when VS Code closed | ✅ Yes | ✅ Yes | ❌ No |
| Configuration UI | ❌ No | ✅ Yes | ✅ Yes |
| Error Feedback | ❌ Limited | ✅ Good | ✅ Full |
| UI Integration | ❌ No | ✅ Yes | ✅ Yes |
| Maintenance | ⭐⭐⭐ Easy | ⭐⭐⭐ Easy | ⭐ Complex |
| Network Communication | ❌ No | ❌ No | ⚠️ Yes (localhost) |
| **Recommended For** | Quick testing | **Most users** | Advanced use cases |

---

## Conclusion

**Recommended Approach**: **Chrome Extension + VS Code URI Handler**

This provides the best balance of:
- ✅ Simple implementation (no HTTP server complexity)
- ✅ Works even when VS Code isn't running (OS launches it)
- ✅ Persistent configuration via Chrome extension options
- ✅ Clean UI integration with OpenGrok pages
- ✅ Zero maintenance on VS Code side
- ✅ No port conflicts or network communication

**Quick Start**: Build the bookmarklet first (30 minutes) to validate the concept, then develop the Chrome extension.

The Chrome extension using `vscode://` URIs provides a polished user experience with minimal complexity. The OS handles launching VS Code, and VS Code handles finding the appropriate workspace - no custom server code needed!
