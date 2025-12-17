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

// Create hover preview popup
let hoverTimeout = null;
let currentPreview = null;
let isMouseOverPreview = false;
let isMouseOverAnchor = false;

function createPreview(anchor, lineNumber) {
  const parsed = parseOpenGrokUrl();
  if (!parsed) return;

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
      <div class="vscode-preview-project">${parsed.project}</div>
      <div class="vscode-preview-path">${parsed.filePath}</div>
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
    openInVSCode(lineNumber);
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

  // File finder button (only if experimental feature enabled)
  chrome.storage.local.get(['experimentalFileFinder'], (result) => {
    if (result.experimentalFileFinder) {
      const finderButton = document.createElement('button');
      finderButton.id = 'vscode-finder-button';
      finderButton.textContent = '🔍 Find File';
      finderButton.className = 'vscode-finder-btn';
      finderButton.title = 'Quick file finder (press T) - Experimental';

      // Insert at the beginning of toolbar (leftmost position)
      toolbar.insertBefore(finderButton, toolbar.firstChild);

      finderButton.addEventListener('click', () => {
        openFileFinder();
      });

      // Add keyboard shortcuts for file finder only if enabled
      document.addEventListener('keydown', handleKeyboardShortcuts);
    }

    // Only append toolbar if it has buttons
    if (toolbar.children.length > 0) {
      document.body.appendChild(toolbar);
    }
  });
}

// Quick File Finder
let fileFinderModal = null;
let cachedFileList = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

  // Create modal
  fileFinderModal = document.createElement('div');
  fileFinderModal.className = 'vscode-finder-modal';
  fileFinderModal.innerHTML = `
    <div class="vscode-finder-container">
      <div class="vscode-finder-header">
        <span class="vscode-finder-title">🔍 Quick File Finder</span>
        <button class="vscode-finder-close">&times;</button>
      </div>
      <input type="text" class="vscode-finder-input" placeholder="Type to search files..." autofocus>
      <div class="vscode-finder-loading">Loading files...</div>
      <div class="vscode-finder-results"></div>
      <div class="vscode-finder-footer">
        <span>↑↓ Navigate</span>
        <span>Enter Open in VS Code</span>
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

  // Input handler with debouncing
  let debounceTimer;
  input.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filterFiles(e.target.value, resultsDiv);
    }, 150);
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
      openSelectedFile();
    }
  });

  // Focus input
  input.focus();

  // Load file list
  await loadFileList(parsed.project);
  fileFinderModal.querySelector('.vscode-finder-loading').style.display = 'none';
  filterFiles('', resultsDiv); // Show all files initially
}

function closeFileFinder() {
  if (fileFinderModal) {
    fileFinderModal.remove();
    fileFinderModal = null;
  }
}

async function loadFileList(project) {
  // Check cache
  const now = Date.now();
  const cacheKey = `fileList_${project}`;

  if (cachedFileList && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return;
  }

  // Try to load from storage cache first (synchronous alternative)
  const cachedData = await new Promise((resolve) => {
    chrome.storage.local.get([cacheKey], (result) => {
      resolve(result[cacheKey]);
    });
  });

  if (cachedData && cachedData.files && cachedData.files.length > 0) {
    const age = now - (cachedData.timestamp || 0);
    if (age < CACHE_DURATION) {
      cachedFileList = cachedData.files;
      cacheTimestamp = cachedData.timestamp;
      console.log(`Loaded ${cachedFileList.length} files from cache`);
      return;
    }
  }

  // Try multiple API approaches
  try {
    const baseUrl = window.location.origin + window.location.pathname.split('/xref/')[0];

    // Method 1: Try the search API to get all files
    try {
      const searchUrl = `${baseUrl}/api/v1/search?projects=${project}&full=*`;
      console.log('Trying search API:', searchUrl);
      const searchResponse = await fetch(searchUrl);
      if (searchResponse.ok) {
        const data = await searchResponse.json();
        // Extract file paths from search results
        const files = new Set();
        if (data.results && typeof data.results === 'object') {
          Object.keys(data.results).forEach(filePath => {
            files.add(filePath);
          });
        }
        if (files.size > 0) {
          cachedFileList = Array.from(files);
          cacheTimestamp = now;
          console.log(`Fetched ${cachedFileList.length} files from search API`);
          chrome.storage.local.set({ [cacheKey]: { files: cachedFileList, timestamp: now } });
          return;
        }
      }
    } catch (e) {
      console.log('Search API failed:', e);
    }

    // Method 2: Try suggest API (might not work on all servers)
    try {
      const suggestUrl = `${baseUrl}/api/v1/suggest?projects=${project}&field=path`;
      console.log('Trying suggest API:', suggestUrl);
      const suggestResponse = await fetch(suggestUrl);
      if (suggestResponse.ok) {
        const data = await suggestResponse.json();
        cachedFileList = data.suggestions || [];
        if (cachedFileList.length > 0) {
          cacheTimestamp = now;
          console.log(`Fetched ${cachedFileList.length} files from suggest API`);
          chrome.storage.local.set({ [cacheKey]: { files: cachedFileList, timestamp: now } });
          return;
        }
      }
    } catch (e) {
      console.log('Suggest API failed:', e);
    }
  } catch (error) {
    console.log('All API methods failed:', error);
  }

  // Fallback: scrape from current page or use cached data
  if (cachedData && cachedData.files) {
    cachedFileList = cachedData.files;
    cacheTimestamp = cachedData.timestamp;
    console.log(`Using stale cache with ${cachedFileList.length} files`);
  } else {
    cachedFileList = scrapeFilesFromPage();
    console.log(`Scraped ${cachedFileList.length} files from page`);
    chrome.storage.local.set({ [cacheKey]: { files: cachedFileList, timestamp: now } });
  }
}

function scrapeFilesFromPage() {
  // Try to extract file paths from the current page
  const files = new Set();

  // Method 1: Get from directory listing links
  document.querySelectorAll('a[href*="/xref/"]').forEach(link => {
    const href = link.getAttribute('href');
    const match = href.match(/\/xref\/[^/]+\/(.+?)(?:[#?]|$)/);
    if (match && match[1]) {
      const path = match[1];
      // Only add if it's not a directory (doesn't end with /)
      if (!path.endsWith('/')) {
        files.add(path);
      }
    }
  });

  // Method 2: Look for file links in directory tables
  document.querySelectorAll('table a').forEach(link => {
    const href = link.getAttribute('href');
    if (href && href.includes('/xref/')) {
      const match = href.match(/\/xref\/[^/]+\/(.+?)(?:[#?]|$)/);
      if (match && match[1] && !match[1].endsWith('/')) {
        files.add(match[1]);
      }
    }
  });

  console.log(`Scraped ${files.size} files from current page`);
  return Array.from(files);
}

function filterFiles(query, resultsDiv) {
  if (!cachedFileList || cachedFileList.length === 0) {
    resultsDiv.innerHTML = '<div class="vscode-finder-empty">No files cached. Navigate through directories to build cache.</div>';
    return;
  }

  const lowerQuery = query.toLowerCase();
  let matches = cachedFileList;

  if (query) {
    // Fuzzy matching: file contains all query characters in order
    matches = cachedFileList.filter(file => {
      const lowerFile = file.toLowerCase();
      let queryIndex = 0;
      for (let i = 0; i < lowerFile.length && queryIndex < lowerQuery.length; i++) {
        if (lowerFile[i] === lowerQuery[queryIndex]) {
          queryIndex++;
        }
      }
      return queryIndex === lowerQuery.length;
    });

    // Sort by relevance (prefer matches earlier in path, exact substring matches)
    matches.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const aIndex = aLower.indexOf(lowerQuery);
      const bIndex = bLower.indexOf(lowerQuery);

      // Exact substring matches first
      if (aIndex !== -1 && bIndex === -1) return -1;
      if (aIndex === -1 && bIndex !== -1) return 1;
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;

      // Then by path depth (fewer slashes = shallower = better)
      const aDepth = (a.match(/\//g) || []).length;
      const bDepth = (b.match(/\//g) || []).length;
      if (aDepth !== bDepth) return aDepth - bDepth;

      return a.localeCompare(b);
    });
  }

  // Limit to top 50 results
  matches = matches.slice(0, 50);

  if (matches.length === 0) {
    resultsDiv.innerHTML = '<div class="vscode-finder-empty">No matching files found</div>';
    return;
  }

  // Render results
  resultsDiv.innerHTML = matches.map((file, index) => {
    const highlighted = highlightMatch(file, query);

    return `
      <div class="vscode-finder-result ${index === 0 ? 'selected' : ''}" data-file="${file}">
        <div class="vscode-finder-filename">${highlighted}</div>
      </div>
    `;
  }).join('');

  // Add click handlers
  resultsDiv.querySelectorAll('.vscode-finder-result').forEach(result => {
    result.addEventListener('click', () => {
      const file = result.getAttribute('data-file');
      openFileInVSCode(file);
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

function openSelectedFile() {
  const selected = fileFinderModal.querySelector('.vscode-finder-result.selected');
  if (!selected) return;

  const file = selected.getAttribute('data-file');
  openFileInVSCode(file);
}

function openFileInVSCode(filePath) {
  const parsed = parseOpenGrokUrl();
  if (!parsed) return;

  // Send to background script to open in VS Code
  chrome.runtime.sendMessage({
    action: 'openInVSCode',
    data: {
      project: parsed.project,
      filePath: filePath,
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

  chrome.runtime.sendMessage({
    action: 'openInVSCode',
    data: parsed
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
