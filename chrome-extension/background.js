// Background service worker for OpenGrok Navigator

// Import debug module
importScripts('debug.js');
const log = OGDebug.createLogger('background');

// Load configuration
async function getConfig() {
  log.trace('Loading configuration');
  const result = await chrome.storage.sync.get({
    projectMappings: {},
    defaultWorkspaceRoot: '',
    openGrokRoots: []
  });
  log.debug('Configuration loaded', result);
  return result;
}

// Native messaging host name
const NATIVE_HOST = 'og_annotate';

// Send message to native host and return response
async function sendNativeMessage(message) {
  log.debug('Sending native message', { action: message.action });
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
        if (chrome.runtime.lastError) {
          log.error('Native message error', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          log.trace('Native message response', response);
          resolve(response);
        }
      });
    } catch (err) {
      log.error('Native message exception', err);
      reject(err);
    }
  });
}

// Annotation API functions
async function readAnnotations(storagePath, project, filePath) {
  return sendNativeMessage({
    action: 'read',
    storagePath,
    project,
    filePath
  });
}

async function saveAnnotation(storagePath, project, filePath, line, author, text, context) {
  return sendNativeMessage({
    action: 'save',
    storagePath,
    project,
    filePath,
    line,
    author,
    text,
    context
  });
}

async function deleteAnnotation(storagePath, project, filePath, line) {
  return sendNativeMessage({
    action: 'delete',
    storagePath,
    project,
    filePath,
    line
  });
}

async function startEditing(storagePath, user, filePath, line) {
  return sendNativeMessage({
    action: 'startEditing',
    storagePath,
    user,
    filePath,
    line
  });
}

async function stopEditing(storagePath, user) {
  return sendNativeMessage({
    action: 'stopEditing',
    storagePath,
    user
  });
}

async function getEditing(storagePath) {
  return sendNativeMessage({
    action: 'getEditing',
    storagePath
  });
}

async function pingNativeHost() {
  return sendNativeMessage({ action: 'ping' });
}

// Open file in VS Code using vscode:// URI
async function openInVSCode(data) {
  log.info('Opening in VS Code', { project: data.project, file: data.filePath, line: data.lineNumber });
  const config = await getConfig();

  let workspaceRoot = config.projectMappings[data.project];

  if (!workspaceRoot) {
    if (config.defaultWorkspaceRoot) {
      workspaceRoot = `${config.defaultWorkspaceRoot}/${data.project}`;
      log.debug('Using default workspace root', workspaceRoot);
    } else {
      log.warn('No mapping found for project', data.project);
      return {
        error: `No mapping found for project: ${data.project}. Please configure in extension options.`
      };
    }
  }

  const localPath = `${workspaceRoot}/${data.filePath}`;
  const vscodeUri = `vscode://file/${localPath}:${data.lineNumber}:1`;
  log.debug('VS Code URI', vscodeUri);

  try {
    return { success: true, uri: vscodeUri };
  } catch (error) {
    log.error('Failed to create VS Code URI', error);
    return { error: error.message };
  }
}

// Check if URL matches an OpenGrok root
function matchesOpenGrokRoot(url, roots) {
  if (!roots || roots.length === 0) return false;

  for (const root of roots) {
    if (!root || !root.trim()) continue;

    try {
      // Normalize root URL (remove trailing slash)
      const normalizedRoot = root.trim().replace(/\/$/, '');

      // Check if URL starts with root
      if (url.startsWith(normalizedRoot)) {
        log.trace('URL matches custom root', { url, root: normalizedRoot });
        return true;
      }
    } catch (e) {
      log.warn('Invalid OpenGrok root URL', root);
    }
  }
  return false;
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

// Inject content scripts into a tab
async function injectContentScripts(tabId, url) {
  log.info('Injecting content scripts', { tabId, url });

  try {
    // Inject CSS first
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content.css', 'dark-theme.css', 'annotations.css']
    });

    // Inject JS
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['debug.js', 'dark-mode-init.js', 'content.js', 'annotations.js']
    });

    log.info('Content scripts injected successfully', { tabId });
  } catch (error) {
    log.error('Failed to inject content scripts', { tabId, error: error.message });
  }
}

// Handle tab updates for custom OpenGrok roots
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only process completed loads with valid URLs
  if (changeInfo.status !== 'complete' || !tab.url) return;

  // Skip chrome:// and other internal URLs
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;

  log.trace('Tab updated', { tabId, url: tab.url });

  const config = await getConfig();
  const roots = config.openGrokRoots || [];

  // Skip if no custom roots configured
  if (roots.length === 0) {
    log.trace('No custom OpenGrok roots configured');
    return;
  }

  // Check if URL matches any custom root (but not default pattern - those are handled by manifest)
  if (matchesOpenGrokRoot(tab.url, roots) && !matchesDefaultPattern(tab.url)) {
    log.info('Custom OpenGrok root detected', { url: tab.url });
    await injectContentScripts(tabId, tab.url);
  }
});

// Create context menus
chrome.runtime.onInstalled.addListener(() => {
  log.info('Extension installed/updated');

  // Remove existing menus first to avoid duplicates
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'open-line-in-vscode',
      title: 'Open in VS Code',
      contexts: ['link'],
      targetUrlPatterns: ['*://*/source/xref/*#*'],
      documentUrlPatterns: ['*://*/source/xref/*']
    });

    chrome.contextMenus.create({
      id: 'open-file-in-vscode',
      title: 'Open current file in VS Code',
      contexts: ['page'],
      documentUrlPatterns: ['*://*/source/xref/*']
    });

    chrome.contextMenus.create({
      id: 'add-annotation',
      title: 'Add annotation to this line',
      contexts: ['page', 'selection'],
      documentUrlPatterns: ['*://*/source/xref/*']
    });

    log.debug('Context menus created');
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  log.debug('Context menu clicked', { menuItemId: info.menuItemId });

  if (!tab || !tab.id) {
    log.error('Invalid tab in context menu click');
    return;
  }

  if (info.menuItemId === 'open-line-in-vscode') {
    const match = info.linkUrl.match(/#(\d+)/);
    const lineNumber = match ? match[1] : '1';
    chrome.tabs.sendMessage(tab.id, {
      action: 'openInVSCode',
      lineNumber: lineNumber
    }, (response) => {
      if (chrome.runtime.lastError) {
        log.error('Failed to send context menu message', chrome.runtime.lastError);
      }
    });
  } else if (info.menuItemId === 'open-file-in-vscode') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'openInVSCode',
      lineNumber: '1'
    }, (response) => {
      if (chrome.runtime.lastError) {
        log.error('Failed to send context menu message', chrome.runtime.lastError);
      }
    });
  } else if (info.menuItemId === 'add-annotation') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'addAnnotationAtCursor'
    }, (response) => {
      if (chrome.runtime.lastError) {
        log.error('Failed to send context menu message', chrome.runtime.lastError);
      }
    });
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  log.debug('Keyboard command received', { command });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      log.error('Failed to query tabs', chrome.runtime.lastError);
      return;
    }
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'keyboardShortcut',
        command: command
      }, (response) => {
        if (chrome.runtime.lastError) {
          log.error('Failed to send keyboard shortcut', chrome.runtime.lastError);
        }
      });
    }
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log.debug('Message received', { action: message.action, sender: sender.tab?.id });

  if (message.action === 'openInVSCode') {
    openInVSCode(message.data).then(sendResponse);
    return true;
  }

  if (message.action === 'checkOpenGrokRoot') {
    // Content script asking if current URL should be treated as OpenGrok
    getConfig().then(config => {
      const isOpenGrok = matchesOpenGrokRoot(message.url, config.openGrokRoots) ||
                         matchesDefaultPattern(message.url);
      log.debug('OpenGrok root check', { url: message.url, isOpenGrok });
      sendResponse({ isOpenGrok });
    });
    return true;
  }

  // Annotation actions
  if (message.action === 'annotation:read') {
    readAnnotations(message.storagePath, message.project, message.filePath)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'annotation:save') {
    saveAnnotation(
      message.storagePath,
      message.project,
      message.filePath,
      message.line,
      message.author,
      message.text,
      message.context
    )
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'annotation:delete') {
    deleteAnnotation(message.storagePath, message.project, message.filePath, message.line)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'annotation:startEditing') {
    startEditing(message.storagePath, message.user, message.filePath, message.line)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'annotation:stopEditing') {
    stopEditing(message.storagePath, message.user)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'annotation:getEditing') {
    getEditing(message.storagePath)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'annotation:ping') {
    pingNativeHost()
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Open settings page when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  log.info('Extension icon clicked, opening options page');
  chrome.runtime.openOptionsPage();
});

log.info('Background service worker initialized');
