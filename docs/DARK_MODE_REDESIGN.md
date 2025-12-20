# Dark Mode Redesign

## Status: ✅ Implemented

The FOUC issue has been resolved using a separate early-init script that runs at `document_start`.

## Original Issues
- **FOUC**: Class added via JS after page load causes flash on large pages (10KB+)
- **Performance**: 900+ lines of CSS with heavy `!important` usage
- **Specificity**: `.opengrok-dark-mode .selector` creates timing dependencies
- **Maintenance**: Hundreds of selectors to keep updated

## Solution: Early Script Injection

The key insight is that CSS files declared in `manifest.json` are injected early, but they use `:root[data-theme="dark"]` selectors that require the attribute to be set by JavaScript. On large pages, there's a race condition between HTML parsing and JS execution.

### Implementation

**Two Content Scripts in manifest.json:**
```json
"content_scripts": [
  {
    "matches": ["*://*/source/xref/*", ...],
    "js": ["dark-mode-init.js"],
    "css": ["content.css", "dark-theme.css"],
    "run_at": "document_start"
  },
  {
    "matches": ["*://*/source/xref/*", ...],
    "js": ["content.js"],
    "run_at": "document_idle"
  }
]
```

**dark-mode-init.js** - Runs at `document_start` (before DOM construction):
```javascript
// Synchronous check from localStorage cache
const cached = localStorage.getItem('darkModeEnabled');
if (cached === 'true') {
  document.documentElement.dataset.theme = 'dark';
}

// Async update from chrome.storage for correctness
chrome.storage.sync.get(['darkModeEnabled'], (result) => {
  // Update localStorage cache and apply setting
});
```

**dark-theme.css** - Uses data attribute selectors:
```css
:root[data-theme="dark"] .selector { /* styles */ }
```

### Why This Works

1. `document_start` runs before any HTML parsing/rendering
2. `localStorage.getItem()` is synchronous - no async delay
3. The attribute is set before the browser applies CSS
4. Dark theme CSS matches immediately - no flash

### Cache Strategy

- **localStorage**: Synchronous cache for instant dark mode on page load
- **chrome.storage.sync**: Source of truth, synced across devices
- First page after settings change may briefly flash (acceptable tradeoff)

### Benefits
- ✅ No FOUC on large pages (attribute set before render)
- ✅ Better performance (browser optimizes static CSS)
- ✅ Easier maintenance (separate concerns)
- ✅ Standards-compliant (data attributes)
- ✅ Real-time toggle from options page still works
