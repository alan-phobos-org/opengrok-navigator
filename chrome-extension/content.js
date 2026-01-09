// OpenGrok Navigator - Content Script
// Adds VS Code integration and UI enhancements to OpenGrok pages

// Initialize debug logger
const log = (typeof OGDebug !== 'undefined') ? OGDebug.createLogger('content') : {
  error: () => {}, warn: () => {}, info: () => {}, debug: () => {}, trace: () => {},
  isEnabled: () => false
};

log.info('Content script loading', { url: window.location.href });

// Configuration cache for custom OpenGrok roots
let cachedConfig = null;
let configLoadPromise = null;

// Load configuration from storage
async function loadConfig() {
  if (cachedConfig) return cachedConfig;
  if (configLoadPromise) return configLoadPromise;

  configLoadPromise = new Promise((resolve) => {
    chrome.storage.sync.get({
      openGrokRoots: [],
      projectMappings: {},
      defaultWorkspaceRoot: ''
    }, (result) => {
      cachedConfig = result;
      log.debug('Configuration loaded', cachedConfig);
      resolve(cachedConfig);
    });
  });

  return configLoadPromise;
}

// Check if URL matches default /source/ pattern
function matchesDefaultPattern(url) {
  const patterns = [
    /\/source\/xref\//,
    /\/source\/search/,
    /\/source\/?$/
  ];

  for (const pattern of patterns) {
    if (pattern.test(url)) {
      return true;
    }
  }
  return false;
}

// Get the base path for the current OpenGrok instance
// Returns the path segment before /xref/, /search, or end of configured root
function getOpenGrokBasePath() {
  const url = window.location.href;

  // Check for default /source/ pattern
  const sourceMatch = url.match(/(.+?\/source)(?:\/xref\/|\/search|\/?$)/);
  if (sourceMatch) {
    log.trace('Using default /source/ base path', sourceMatch[1]);
    return sourceMatch[1];
  }

  // Check cached config for custom roots
  if (cachedConfig && cachedConfig.openGrokRoots) {
    for (const root of cachedConfig.openGrokRoots) {
      if (!root) continue;
      const normalizedRoot = root.trim().replace(/\/$/, '');
      if (url.startsWith(normalizedRoot)) {
        log.trace('Using custom root base path', normalizedRoot);
        return normalizedRoot;
      }
    }
  }

  log.warn('Could not determine OpenGrok base path');
  return null;
}

// Parse OpenGrok URL to extract file path and line number
// Supports both /source/xref/ pattern and custom roots
function parseOpenGrokUrl() {
  const url = window.location.href;
  log.trace('Parsing OpenGrok URL', url);

  // Remove query parameters (like ?r=revision) before parsing
  const urlWithoutQuery = url.split('?')[0];

  // Try standard /xref/ pattern first
  let match = urlWithoutQuery.match(/\/xref\/([^/]+)\/(.+?)(?:#(\d+))?$/);

  if (!match) {
    // Try to find project/path after the base path
    const basePath = getOpenGrokBasePath();
    if (basePath) {
      const afterBase = urlWithoutQuery.substring(basePath.length);
      // Look for patterns like /xref/project/path or just /project/path
      match = afterBase.match(/(?:\/xref)?\/([^/]+)\/(.+?)(?:#(\d+))?$/);
    }
  }

  if (!match) {
    log.debug('Could not parse OpenGrok URL', url);
    return null;
  }

  const parsed = {
    project: match[1],
    filePath: match[2].replace(/#.*$/, ''),
    lineNumber: match[3] || window.location.hash.replace('#', '') || '1'
  };

  log.debug('Parsed URL', parsed);
  return parsed;
}

// Parse search result link to extract file path and line number
function parseSearchResultLink(linkElement) {
  const href = linkElement.getAttribute('href');
  if (!href) return null;

  // Match /xref/{project}/{path}#{line}
  const match = href.match(/\/xref\/([^/]+)\/(.+?)#(\d+)$/);
  if (!match) {
    log.trace('Could not parse search result link', href);
    return null;
  }

  return {
    project: match[1],
    filePath: match[2],
    lineNumber: match[3]
  };
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// Add UI enhancements
function enhanceUI() {
  log.info('Enhancing UI');

  // Enhance line numbers on file pages (a.l for regular, a.hl for highlighted every 10th)
  const lineNumbers = document.querySelectorAll('a.l, a.hl');
  log.debug('Found line number anchors', { count: lineNumbers.length });

  lineNumbers.forEach(anchor => {
    anchor.title = 'Ctrl+Click to open in VS Code';
    anchor.style.cursor = 'pointer';

    // Click handler
    anchor.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const lineNum = anchor.textContent.trim();
        log.info('Line number Ctrl+clicked', { line: lineNum });
        openInVSCode(lineNum);
      }
    });
  });

  // Enhance line numbers on search results pages (a.s > span.l)
  const searchResultLines = document.querySelectorAll('a.s');
  log.debug('Found search result links', { count: searchResultLines.length });

  searchResultLines.forEach(anchor => {
    const lineSpan = anchor.querySelector('span.l');
    if (!lineSpan) return;

    // Parse the link to extract file info
    const linkInfo = parseSearchResultLink(anchor);
    if (!linkInfo) return;

    // Style the line number span to indicate it's clickable
    lineSpan.style.cursor = 'pointer';
    lineSpan.title = 'Ctrl+Click to open in VS Code';

    // Click handler on the line number span
    lineSpan.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation(); // Prevent navigation
        log.info('Search result line Ctrl+clicked', linkInfo);
        openInVSCodeWithParams(linkInfo.project, linkInfo.filePath, linkInfo.lineNumber);
      }
    });
  });

  // Check if this is a file page (not a directory listing)
  // A file page has line numbers (a.l or a.hl elements) AND doesn't have a directory listing table
  const hasLineNumbers = document.querySelector('a.l, a.hl') !== null;
  const hasDirectoryListing = document.querySelector('table.directory, table#dirlist, .directory-list') !== null;
  const isFilePage = hasLineNumbers && !hasDirectoryListing;

  log.debug('Page analysis', { hasLineNumbers, hasDirectoryListing, isFilePage });

  // Create button toolbar container
  const toolbar = document.createElement('div');
  toolbar.className = 'vscode-button-toolbar';
  toolbar.id = 'vscode-button-toolbar';

  // Add floating buttons for file pages
  if (isFilePage) {
    // Live-sync toggle button
    const syncButton = document.createElement('button');
    syncButton.id = 'vscode-sync-button';
    syncButton.textContent = 'Live Sync to VS Code';
    syncButton.className = 'vscode-sync-btn';
    syncButton.title = 'Toggle live sync with VS Code - automatically follow navigation';
    toolbar.appendChild(syncButton);

    // Open in VS Code button
    const openButton = document.createElement('button');
    openButton.id = 'vscode-open-button';
    openButton.textContent = 'Open in VS Code';
    openButton.className = 'vscode-open-btn';
    openButton.title = 'Open current file in VS Code';
    toolbar.appendChild(openButton);

    openButton.addEventListener('click', () => {
      log.info('Open in VS Code button clicked');
      openInVSCode();
    });

    // Setup live-sync button
    setupLiveSyncButton(syncButton);
  }

  // File finder button (always enabled)
  const finderButton = document.createElement('button');
  finderButton.id = 'og-finder-button';
  finderButton.textContent = 'Find File';
  finderButton.className = 'vscode-finder-btn';
  finderButton.title = 'Quick file finder (press T)';

  // Insert at the beginning of toolbar (leftmost position)
  toolbar.insertBefore(finderButton, toolbar.firstChild);

  finderButton.addEventListener('click', () => {
    log.info('File finder button clicked');
    openFileFinder();
  });

  // Add keyboard shortcuts for file finder
  document.addEventListener('keydown', handleKeyboardShortcuts);

  // Only append toolbar if it has buttons
  if (toolbar.children.length > 0) {
    document.body.appendChild(toolbar);
    log.debug('Toolbar added to page');
  }
}

// Quick File Finder
let fileFinderModal = null;
let searchTimeout = null;
let currentProject = null;

function handleKeyboardShortcuts(e) {
  // 't' key to open file finder (unless in input field)
  if (e.key === 't' && !isInInputField(e.target)) {
    e.preventDefault();
    log.debug('File finder shortcut triggered');
    openFileFinder();
  }
  // 'c' key to create annotation at current line
  if (e.key === 'c' && !isInInputField(e.target)) {
    e.preventDefault();
    if (window.annotationManager) {
      window.annotationManager.addAnnotationAtCursor();
    }
  }
  // 'x' key to jump to next annotation
  if (e.key === 'x' && !isInInputField(e.target)) {
    e.preventDefault();
    if (window.annotationManager) {
      window.annotationManager.jumpToNextAnnotation();
    }
  }
  // ESC to close file finder
  if (e.key === 'Escape' && fileFinderModal) {
    closeFileFinder();
  }
}

function isInInputField(element) {
  if (!element) return false;
  const tagName = element.tagName ? element.tagName.toLowerCase() : '';
  return tagName === 'input' || tagName === 'textarea' || element.isContentEditable;
}

async function openFileFinder() {
  if (fileFinderModal) {
    // Already open, just focus the input
    const input = fileFinderModal.querySelector('.vscode-finder-input');
    if (input) input.focus();
    return;
  }

  const parsed = parseOpenGrokUrl();
  if (!parsed) {
    log.warn('Cannot open file finder - failed to parse URL');
    return;
  }

  currentProject = parsed.project;
  log.info('Opening file finder', { project: currentProject });

  // Create modal
  fileFinderModal = document.createElement('div');
  fileFinderModal.className = 'vscode-finder-modal';
  fileFinderModal.innerHTML = `
    <div class="vscode-finder-container">
      <div class="vscode-finder-header">
        <span class="vscode-finder-title">Quick File Finder</span>
        <button class="vscode-finder-close">&times;</button>
      </div>
      <input type="text" class="vscode-finder-input" placeholder="Type to search files in ${escapeHtml(parsed.project)}..." autofocus>
      <div class="vscode-finder-results">
        <div class="vscode-finder-empty">Type at least 2 characters to search</div>
      </div>
      <div class="vscode-finder-footer">
        <span>Navigate</span>
        <span>Enter Open</span>
        <span>Shift+Enter VS Code</span>
        <span>ESC Close</span>
      </div>
    </div>
  `;

  document.body.appendChild(fileFinderModal);

  // Setup event listeners
  const input = fileFinderModal.querySelector('.vscode-finder-input');
  const closeBtn = fileFinderModal.querySelector('.vscode-finder-close');
  const resultsDiv = fileFinderModal.querySelector('.vscode-finder-results');

  closeBtn.addEventListener('click', closeFileFinder);

  // Click outside to close
  fileFinderModal.addEventListener('click', (e) => {
    if (e.target === fileFinderModal) {
      closeFileFinder();
    }
  });

  // Input handler with debouncing (300ms for server-side search)
  input.addEventListener('input', (e) => {
    const query = e.target.value.trim();

    clearTimeout(searchTimeout);

    if (query.length < 2) {
      resultsDiv.innerHTML = '<div class="vscode-finder-empty">Type at least 2 characters to search</div>';
      return;
    }

    resultsDiv.innerHTML = '<div class="vscode-finder-loading">Searching...</div>';

    searchTimeout = setTimeout(() => {
      searchFiles(query, resultsDiv);
    }, 300);
  });

  // Keyboard navigation
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectNextResult();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectPrevResult();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openSelectedFile(e.shiftKey);
    }
  });

  // Focus input
  input.focus();
}

function closeFileFinder() {
  if (fileFinderModal) {
    fileFinderModal.remove();
    fileFinderModal = null;
    log.debug('File finder closed');
  }
  clearTimeout(searchTimeout);
}

// Server-side file search using OpenGrok REST API
async function searchFiles(query, resultsDiv) {
  const basePath = getOpenGrokBasePath();
  if (!basePath) {
    resultsDiv.innerHTML = '<div class="vscode-finder-empty">Could not determine OpenGrok base path</div>';
    return;
  }

  log.debug('Searching files', { query, basePath, project: currentProject });

  try {
    // Use path search with wildcards for substring matching
    const searchParams = new URLSearchParams({
      path: `*${query}*`,
      projects: currentProject,
      maxresults: '50'
    });

    const searchUrl = `${basePath}/api/v1/search?${searchParams}`;
    log.trace('Search URL', searchUrl);

    const response = await fetch(searchUrl);

    if (!response.ok) {
      if (response.status === 404) {
        log.warn('REST API not available', { status: response.status });
        resultsDiv.innerHTML = '<div class="vscode-finder-empty">File search not available on this OpenGrok instance (requires REST API v1.0+)</div>';
      } else if (response.status === 401 || response.status === 403) {
        log.warn('Authentication required for search', { status: response.status });
        resultsDiv.innerHTML = '<div class="vscode-finder-empty">Authentication required for file search</div>';
      } else {
        log.error('Search request failed', { status: response.status });
        resultsDiv.innerHTML = `<div class="vscode-finder-empty">Search failed (HTTP ${response.status})</div>`;
      }
      return;
    }

    const data = await response.json();
    log.trace('Search response', data);

    // Extract file paths from results (results are keyed by file path)
    const files = Object.keys(data.results || {});

    if (files.length === 0) {
      resultsDiv.innerHTML = '<div class="vscode-finder-empty">No matching files found</div>';
      return;
    }

    log.debug('Search results', { count: files.length });

    // Sort by relevance (shorter paths and filename matches first)
    const lowerQuery = query.toLowerCase();
    files.sort((a, b) => {
      const aFilename = a.split('/').pop().toLowerCase();
      const bFilename = b.split('/').pop().toLowerCase();

      // Filename matches first
      const aInFilename = aFilename.includes(lowerQuery);
      const bInFilename = bFilename.includes(lowerQuery);
      if (aInFilename && !bInFilename) return -1;
      if (!aInFilename && bInFilename) return 1;

      // Then by path length (shorter = better)
      if (a.length !== b.length) return a.length - b.length;

      return a.localeCompare(b);
    });

    displayResults(files, query, resultsDiv);

  } catch (error) {
    log.error('Search failed', error);
    resultsDiv.innerHTML = '<div class="vscode-finder-empty">Search failed - network or API error</div>';
  }
}

function displayResults(files, query, resultsDiv) {
  resultsDiv.innerHTML = files.map((file, index) => {
    const filename = file.split('/').pop();
    const directory = file.substring(0, file.lastIndexOf('/')) || '/';
    const highlightedFilename = highlightMatch(filename, query);

    return `
      <div class="vscode-finder-result ${index === 0 ? 'selected' : ''}" data-file="${escapeHtml(file)}">
        <div class="vscode-finder-filename">${highlightedFilename}</div>
        <div class="vscode-finder-directory">${escapeHtml(directory)}</div>
      </div>
    `;
  }).join('');

  // Add click handlers (click = OpenGrok, shift+click = VS Code)
  resultsDiv.querySelectorAll('.vscode-finder-result').forEach(result => {
    result.addEventListener('click', (e) => {
      const file = result.getAttribute('data-file');
      if (e.shiftKey) {
        openFileInVSCode(file);
      } else {
        navigateToFile(file);
      }
    });
  });
}

function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let result = '';
  let lastIndex = 0;
  let queryIndex = 0;

  for (let i = 0; i < text.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      result += escapeHtml(text.substring(lastIndex, i));
      result += `<mark>${escapeHtml(text[i])}</mark>`;
      lastIndex = i + 1;
      queryIndex++;
    }
  }
  result += escapeHtml(text.substring(lastIndex));
  return result;
}

function selectNextResult() {
  if (!fileFinderModal) return;

  const results = fileFinderModal.querySelectorAll('.vscode-finder-result');
  const selected = fileFinderModal.querySelector('.vscode-finder-result.selected');

  if (!selected || !results.length) return;

  const currentIndex = Array.from(results).indexOf(selected);
  const nextIndex = (currentIndex + 1) % results.length;

  selected.classList.remove('selected');
  results[nextIndex].classList.add('selected');
  results[nextIndex].scrollIntoView({ block: 'nearest' });
}

function selectPrevResult() {
  if (!fileFinderModal) return;

  const results = fileFinderModal.querySelectorAll('.vscode-finder-result');
  const selected = fileFinderModal.querySelector('.vscode-finder-result.selected');

  if (!selected || !results.length) return;

  const currentIndex = Array.from(results).indexOf(selected);
  const prevIndex = (currentIndex - 1 + results.length) % results.length;

  selected.classList.remove('selected');
  results[prevIndex].classList.add('selected');
  results[prevIndex].scrollIntoView({ block: 'nearest' });
}

function openSelectedFile(openInVSCodeFlag = false) {
  if (!fileFinderModal) return;

  const selected = fileFinderModal.querySelector('.vscode-finder-result.selected');
  if (!selected) return;

  const file = selected.getAttribute('data-file');
  if (openInVSCodeFlag) {
    openFileInVSCode(file);
  } else {
    navigateToFile(file);
  }
}

function navigateToFile(filePath) {
  const basePath = getOpenGrokBasePath();
  if (!basePath) {
    log.error('Cannot navigate - no base path');
    return;
  }

  // The API returns paths that may already include the project prefix
  // Strip it if present to avoid duplication
  let cleanPath = filePath;
  if (currentProject) {
    if (filePath.startsWith('/' + currentProject + '/')) {
      cleanPath = filePath.substring(currentProject.length + 1);
    } else if (filePath.startsWith(currentProject + '/')) {
      cleanPath = filePath.substring(currentProject.length + 1);
    }
  }

  const fileUrl = `${basePath}/xref/${currentProject}${cleanPath.startsWith('/') ? '' : '/'}${cleanPath}`;
  log.info('Navigating to file', { url: fileUrl });

  closeFileFinder();
  window.location.href = fileUrl;
}

function openFileInVSCode(filePath) {
  const parsed = parseOpenGrokUrl();
  if (!parsed) {
    log.error('Cannot open in VS Code - failed to parse URL');
    return;
  }

  // The API returns paths that may already include the project prefix
  // Strip it if present to avoid duplication
  let cleanPath = filePath;
  if (filePath.startsWith('/' + parsed.project + '/')) {
    cleanPath = filePath.substring(parsed.project.length + 2);
  } else if (filePath.startsWith(parsed.project + '/')) {
    cleanPath = filePath.substring(parsed.project.length + 1);
  }
  // Also strip leading slash for the VS Code path
  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.substring(1);
  }

  log.info('Opening file in VS Code', { project: parsed.project, path: cleanPath });

  // Send to background script to open in VS Code
  chrome.runtime.sendMessage({
    action: 'openInVSCode',
    data: {
      project: parsed.project,
      filePath: cleanPath,
      lineNumber: '1'
    }
  }, (response) => {
    if (chrome.runtime.lastError) {
      log.error('Failed to send message to background', chrome.runtime.lastError);
      return;
    }
    if (response && response.error) {
      log.error('VS Code open failed', response.error);
      alert(`Error: ${response.error}`);
    } else if (response && response.uri) {
      log.debug('Opening VS Code URI', response.uri);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = response.uri;
      document.body.appendChild(iframe);
      setTimeout(() => iframe.remove(), 1000);

      // Close the finder
      closeFileFinder();
    }
  });
}

// Live-sync functionality
let liveSyncEnabled = false;
let lastSyncedLine = null;

function setupLiveSyncButton(syncButton) {
  // Load saved state
  chrome.storage.local.get(['liveSyncEnabled'], (result) => {
    if (result.liveSyncEnabled) {
      liveSyncEnabled = true;
      syncButton.classList.add('active');
      log.info('Live sync restored from storage');
      startLiveSync();
    }
  });

  syncButton.addEventListener('click', () => {
    liveSyncEnabled = !liveSyncEnabled;
    syncButton.classList.toggle('active');
    log.info('Live sync toggled', { enabled: liveSyncEnabled });

    chrome.storage.local.set({ liveSyncEnabled });

    if (liveSyncEnabled) {
      startLiveSync();
    } else {
      stopLiveSync();
    }
  });
}

let urlObserver = null;
let hashChangeHandler = null;

function startLiveSync() {
  log.debug('Starting live sync');

  // Sync immediately
  syncCurrentLocation();

  // Watch for hash changes (line number changes)
  hashChangeHandler = () => {
    syncCurrentLocation();
  };
  window.addEventListener('hashchange', hashChangeHandler);

  // Watch for URL changes (SPA navigation)
  let lastUrl = location.href;
  urlObserver = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      syncCurrentLocation();
    }
  }, 500);
}

function stopLiveSync() {
  log.debug('Stopping live sync');

  if (hashChangeHandler) {
    window.removeEventListener('hashchange', hashChangeHandler);
    hashChangeHandler = null;
  }
  if (urlObserver) {
    clearInterval(urlObserver);
    urlObserver = null;
  }
}

function syncCurrentLocation() {
  const parsed = parseOpenGrokUrl();
  if (!parsed) return;

  const currentLine = parsed.lineNumber;

  // Only sync if line changed
  if (currentLine !== lastSyncedLine) {
    lastSyncedLine = currentLine;
    log.debug('Syncing location', { line: currentLine });
    openInVSCode(currentLine);
  }
}

// Open file in VS Code with explicit parameters
function openInVSCodeWithParams(project, filePath, lineNumber) {
  log.info('Opening in VS Code', { project, filePath, lineNumber });

  chrome.runtime.sendMessage({
    action: 'openInVSCode',
    data: {
      project: project,
      filePath: filePath,
      lineNumber: lineNumber
    }
  }, (response) => {
    if (chrome.runtime.lastError) {
      log.error('Failed to send message to background', chrome.runtime.lastError);
      return;
    }
    if (response && response.error) {
      log.error('VS Code open failed', response.error);
      alert(`Error: ${response.error}`);
    } else if (response && response.uri) {
      log.debug('Opening VS Code URI', response.uri);
      // Use hidden iframe to trigger protocol handler without popup
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = response.uri;
      document.body.appendChild(iframe);
      // Clean up after a short delay
      setTimeout(() => iframe.remove(), 1000);
    }
  });
}

// Open file in VS Code
function openInVSCode(lineNumber = null) {
  const parsed = parseOpenGrokUrl();
  if (!parsed) {
    log.warn('Could not parse OpenGrok URL for VS Code');
    alert('Could not parse OpenGrok URL');
    return;
  }

  if (lineNumber) {
    parsed.lineNumber = lineNumber;
  }

  openInVSCodeWithParams(parsed.project, parsed.filePath, parsed.lineNumber);
}

// Handle messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log.debug('Received message', { action: message.action });

  if (message.action === 'keyboardShortcut') {
    if (message.command === 'open-current-line') {
      const hash = window.location.hash.replace('#', '');
      openInVSCode(hash || '1');
    } else if (message.command === 'open-current-file') {
      openInVSCode('1');
    }
    sendResponse({ success: true });
  } else if (message.action === 'openInVSCode') {
    openInVSCode(message.lineNumber);
    sendResponse({ success: true });
  } else if (message.action === 'addAnnotationAtCursor') {
    // Forward to annotation manager if it exists
    if (window.annotationManager) {
      window.annotationManager.addAnnotationAtCursor();
    }
    sendResponse({ success: true });
  }
  return true;
});

// Initialize
async function init() {
  log.info('Initializing content script');

  // Load configuration first
  await loadConfig();

  // Enhance the UI
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceUI);
  } else {
    enhanceUI();
  }

  log.info('Content script initialized');
}

init();
