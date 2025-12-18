// Parse OpenGrok URL to extract file path and line number
function parseOpenGrokUrl() {
  const url = window.location.href;

  // Remove query parameters (like ?r=revision) before parsing
  const urlWithoutQuery = url.split('?')[0];

  const match = urlWithoutQuery.match(/\/xref\/([^/]+)\/(.+?)(?:#(\d+))?$/);
  if (!match) return null;

  return {
    project: match[1],
    filePath: match[2].replace(/#.*$/, ''),
    lineNumber: match[3] || window.location.hash.replace('#', '') || '1'
  };
}

// Parse search result link to extract file path and line number
function parseSearchResultLink(linkElement) {
  const href = linkElement.getAttribute('href');
  if (!href) return null;

  // Match /xref/{project}/{path}#{line}
  const match = href.match(/\/xref\/([^/]+)\/(.+?)#(\d+)$/);
  if (!match) return null;

  return {
    project: match[1],
    filePath: match[2],
    lineNumber: match[3]
  };
}

// Create hover preview popup
let hoverTimeout = null;
let currentPreview = null;
let isMouseOverPreview = false;
let isMouseOverAnchor = false;

function createPreview(anchor, lineNumber, project = null, filePath = null) {
  // If project/filePath not provided, parse from URL
  if (!project || !filePath) {
    const parsed = parseOpenGrokUrl();
    if (!parsed) return;
    project = parsed.project;
    filePath = parsed.filePath;
  }

  // Remove existing preview
  if (currentPreview) {
    currentPreview.remove();
    currentPreview = null;
  }

  const preview = document.createElement('div');
  preview.className = 'vscode-preview';
  preview.innerHTML = `
    <div class="vscode-preview-header">
      <span class="vscode-preview-title">Open in VS Code</span>
      <button class="vscode-preview-close">&times;</button>
    </div>
    <div class="vscode-preview-info">
      <div class="vscode-preview-project">${project}</div>
      <div class="vscode-preview-path">${filePath}</div>
      <div class="vscode-preview-line">Line ${lineNumber}</div>
    </div>
    <button class="vscode-preview-open">Open</button>
  `;

  // Position near the anchor with gap for easier mouse movement
  const rect = anchor.getBoundingClientRect();
  preview.style.top = `${rect.bottom + window.scrollY + 2}px`;
  preview.style.left = `${rect.left + window.scrollX}px`;

  document.body.appendChild(preview);
  currentPreview = preview;

  // Add event listeners
  preview.querySelector('.vscode-preview-close').addEventListener('click', () => {
    preview.remove();
    currentPreview = null;
    isMouseOverPreview = false;
  });

  preview.querySelector('.vscode-preview-open').addEventListener('click', () => {
    openInVSCodeWithParams(project, filePath, lineNumber);
    preview.remove();
    currentPreview = null;
    isMouseOverPreview = false;
  });

  // Keep preview open when hovering over it
  preview.addEventListener('mouseenter', () => {
    isMouseOverPreview = true;
    clearTimeout(hoverTimeout);
  });

  preview.addEventListener('mouseleave', () => {
    isMouseOverPreview = false;
    hoverTimeout = setTimeout(() => {
      if (!isMouseOverAnchor && !isMouseOverPreview && currentPreview) {
        currentPreview.remove();
        currentPreview = null;
      }
    }, 300);
  });
}

function hidePreview() {
  if (!isMouseOverPreview && !isMouseOverAnchor && currentPreview) {
    currentPreview.remove();
    currentPreview = null;
  }
}

// Add UI enhancements
function enhanceUI() {
  // Enhance line numbers on file pages (a.l)
  const lineNumbers = document.querySelectorAll('a.l');

  lineNumbers.forEach(anchor => {
    anchor.title = 'Ctrl+Click to open in VS Code';
    anchor.style.cursor = 'pointer';

    // Click handler
    anchor.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const lineNum = anchor.textContent.trim();
        openInVSCode(lineNum);
      }
    });

    // Hover preview
    anchor.addEventListener('mouseenter', () => {
      isMouseOverAnchor = true;
      const lineNum = anchor.textContent.trim();
      hoverTimeout = setTimeout(() => {
        createPreview(anchor, lineNum);
      }, 500); // 500ms delay
    });

    anchor.addEventListener('mouseleave', () => {
      isMouseOverAnchor = false;
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        hidePreview();
      }, 300);
    });
  });

  // Enhance line numbers on search results pages (a.s > span.l)
  const searchResultLines = document.querySelectorAll('a.s');

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
        openInVSCodeWithParams(linkInfo.project, linkInfo.filePath, linkInfo.lineNumber);
      }
    });

    // Hover preview on the line number span
    lineSpan.addEventListener('mouseenter', () => {
      isMouseOverAnchor = true;
      hoverTimeout = setTimeout(() => {
        createPreview(lineSpan, linkInfo.lineNumber, linkInfo.project, linkInfo.filePath);
      }, 500);
    });

    lineSpan.addEventListener('mouseleave', () => {
      isMouseOverAnchor = false;
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        hidePreview();
      }, 300);
    });
  });

  // Check if this is a file page (not a directory listing)
  // A file page has line numbers (a.l elements) AND doesn't have a directory listing table
  const hasLineNumbers = document.querySelector('a.l') !== null;
  const hasDirectoryListing = document.querySelector('table.directory, table#dirlist, .directory-list') !== null;
  const isFilePage = hasLineNumbers && !hasDirectoryListing;

  // Create button toolbar container
  const toolbar = document.createElement('div');
  toolbar.className = 'vscode-button-toolbar';
  toolbar.id = 'vscode-button-toolbar';

  // Add floating buttons for file pages
  if (isFilePage) {
    // Live-sync toggle button
    const syncButton = document.createElement('button');
    syncButton.id = 'vscode-sync-button';
    syncButton.textContent = '⚡ Live Sync to VS Code';
    syncButton.className = 'vscode-sync-btn';
    syncButton.title = 'Toggle live sync with VS Code - automatically follow navigation';
    toolbar.appendChild(syncButton);

    // Open in VS Code button
    const openButton = document.createElement('button');
    openButton.id = 'vscode-open-button';
    openButton.textContent = '📝 Open in VS Code';
    openButton.className = 'vscode-open-btn';
    openButton.title = 'Open current file in VS Code';
    toolbar.appendChild(openButton);

    openButton.addEventListener('click', () => {
      openInVSCode();
    });

    // Setup live-sync button
    setupLiveSyncButton(syncButton);
  }

  // File finder button (always enabled)
  const finderButton = document.createElement('button');
  finderButton.id = 'vscode-finder-button';
  finderButton.textContent = '🔍 Find File';
  finderButton.className = 'vscode-finder-btn';
  finderButton.title = 'Quick file finder (press T)';

  // Insert at the beginning of toolbar (leftmost position)
  toolbar.insertBefore(finderButton, toolbar.firstChild);

  finderButton.addEventListener('click', () => {
    openFileFinder();
  });

  // Add keyboard shortcuts for file finder
  document.addEventListener('keydown', handleKeyboardShortcuts);

  // Only append toolbar if it has buttons
  if (toolbar.children.length > 0) {
    document.body.appendChild(toolbar);
  }

  // Load dark mode setting from storage
  loadDarkModeSetting();
}

// Quick File Finder
let fileFinderModal = null;
let searchTimeout = null;
let currentProject = null;

function handleKeyboardShortcuts(e) {
  // 't' key to open file finder (unless in input field)
  if (e.key === 't' && !isInInputField(e.target)) {
    e.preventDefault();
    openFileFinder();
  }
  // ESC to close file finder
  if (e.key === 'Escape' && fileFinderModal) {
    closeFileFinder();
  }
}

function isInInputField(element) {
  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || element.isContentEditable;
}

async function openFileFinder() {
  if (fileFinderModal) {
    // Already open, just focus the input
    fileFinderModal.querySelector('.vscode-finder-input').focus();
    return;
  }

  const parsed = parseOpenGrokUrl();
  if (!parsed) return;

  currentProject = parsed.project;

  // Create modal
  fileFinderModal = document.createElement('div');
  fileFinderModal.className = 'vscode-finder-modal';
  fileFinderModal.innerHTML = `
    <div class="vscode-finder-container">
      <div class="vscode-finder-header">
        <span class="vscode-finder-title">Quick File Finder</span>
        <button class="vscode-finder-close">&times;</button>
      </div>
      <input type="text" class="vscode-finder-input" placeholder="Type to search files in ${parsed.project}..." autofocus>
      <div class="vscode-finder-results">
        <div class="vscode-finder-empty">Type at least 2 characters to search</div>
      </div>
      <div class="vscode-finder-footer">
        <span>↑↓ Navigate</span>
        <span>Enter Open</span>
        <span>⇧Enter VS Code</span>
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
  }
  clearTimeout(searchTimeout);
}

// Server-side file search using OpenGrok REST API
async function searchFiles(query, resultsDiv) {
  const baseUrl = window.location.origin + window.location.pathname.split('/xref/')[0];

  try {
    // Use path search with wildcards for substring matching
    const searchParams = new URLSearchParams({
      path: `*${query}*`,
      projects: currentProject,
      maxresults: '50'
    });

    const searchUrl = `${baseUrl}/api/v1/search?${searchParams}`;
    const response = await fetch(searchUrl);

    if (!response.ok) {
      if (response.status === 404) {
        resultsDiv.innerHTML = '<div class="vscode-finder-empty">File search not available on this OpenGrok instance (requires REST API v1.0+)</div>';
      } else if (response.status === 401 || response.status === 403) {
        resultsDiv.innerHTML = '<div class="vscode-finder-empty">Authentication required for file search</div>';
      } else {
        resultsDiv.innerHTML = `<div class="vscode-finder-empty">Search failed (HTTP ${response.status})</div>`;
      }
      return;
    }

    const data = await response.json();

    // Extract file paths from results (results are keyed by file path)
    const files = Object.keys(data.results || {});

    if (files.length === 0) {
      resultsDiv.innerHTML = '<div class="vscode-finder-empty">No matching files found</div>';
      return;
    }

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function selectNextResult() {
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
  // Navigate to the file in OpenGrok
  const baseUrl = window.location.origin + window.location.pathname.split('/xref/')[0];

  // The API returns paths that may already include the project prefix
  // Strip it if present to avoid duplication
  let cleanPath = filePath;
  if (filePath.startsWith('/' + currentProject + '/')) {
    cleanPath = filePath.substring(currentProject.length + 1);
  } else if (filePath.startsWith(currentProject + '/')) {
    cleanPath = filePath.substring(currentProject.length + 1);
  }

  const fileUrl = `${baseUrl}/xref/${currentProject}${cleanPath.startsWith('/') ? '' : '/'}${cleanPath}`;

  closeFileFinder();
  window.location.href = fileUrl;
}

function openFileInVSCode(filePath) {
  const parsed = parseOpenGrokUrl();
  if (!parsed) return;

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

  // Send to background script to open in VS Code
  chrome.runtime.sendMessage({
    action: 'openInVSCode',
    data: {
      project: parsed.project,
      filePath: cleanPath,
      lineNumber: '1'
    }
  }, (response) => {
    if (response && response.error) {
      alert(`Error: ${response.error}`);
    } else if (response && response.uri) {
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
      startLiveSync();
    }
  });

  syncButton.addEventListener('click', () => {
    liveSyncEnabled = !liveSyncEnabled;
    syncButton.classList.toggle('active');

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
    openInVSCode(currentLine);
  }
}

// Open file in VS Code with explicit parameters
function openInVSCodeWithParams(project, filePath, lineNumber) {
  chrome.runtime.sendMessage({
    action: 'openInVSCode',
    data: {
      project: project,
      filePath: filePath,
      lineNumber: lineNumber
    }
  }, (response) => {
    if (response && response.error) {
      alert(`Error: ${response.error}`);
    } else if (response && response.uri) {
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
    alert('Could not parse OpenGrok URL');
    return;
  }

  if (lineNumber) {
    parsed.lineNumber = lineNumber;
  }

  openInVSCodeWithParams(parsed.project, parsed.filePath, parsed.lineNumber);
}

// Dark mode functionality
function loadDarkModeSetting() {
  // Load saved state from storage
  chrome.storage.sync.get(['darkModeEnabled'], (result) => {
    if (result.darkModeEnabled) {
      document.documentElement.classList.add('opengrok-dark-mode');
    }
  });
}

// Listen for storage changes from options page
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.darkModeEnabled) {
    if (changes.darkModeEnabled.newValue) {
      document.documentElement.classList.add('opengrok-dark-mode');
    } else {
      document.documentElement.classList.remove('opengrok-dark-mode');
    }
  }
});

// Handle messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
  }
  return true;
});

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceUI);
} else {
  enhanceUI();
}
