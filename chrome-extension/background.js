// Load configuration
async function getConfig() {
  const result = await chrome.storage.sync.get({
    projectMappings: {},
    defaultWorkspaceRoot: ''
  });
  return result;
}

// Native messaging host name
const NATIVE_HOST = 'og_annotate';

// Send message to native host and return response
async function sendNativeMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (err) {
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
  const config = await getConfig();

  let workspaceRoot = config.projectMappings[data.project];

  if (!workspaceRoot) {
    if (config.defaultWorkspaceRoot) {
      workspaceRoot = `${config.defaultWorkspaceRoot}/${data.project}`;
    } else {
      return {
        error: `No mapping found for project: ${data.project}. Please configure in extension options.`
      };
    }
  }

  const localPath = `${workspaceRoot}/${data.filePath}`;
  const vscodeUri = `vscode://file/${localPath}:${data.lineNumber}:1`;

  try {
    // Use a hidden iframe or direct navigation to avoid popup
    // We'll send the URI back to content script to handle
    return { success: true, uri: vscodeUri };
  } catch (error) {
    return { error: error.message };
  }
}

// Create context menus
chrome.runtime.onInstalled.addListener(() => {
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
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-line-in-vscode') {
    const match = info.linkUrl.match(/#(\d+)/);
    const lineNumber = match ? match[1] : '1';
    chrome.tabs.sendMessage(tab.id, {
      action: 'openInVSCode',
      lineNumber: lineNumber
    });
  } else if (info.menuItemId === 'open-file-in-vscode') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'openInVSCode',
      lineNumber: '1'
    });
  } else if (info.menuItemId === 'add-annotation') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'addAnnotationAtCursor'
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
  chrome.runtime.openOptionsPage();
});
