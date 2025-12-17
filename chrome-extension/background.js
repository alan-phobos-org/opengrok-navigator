// Load configuration
async function getConfig() {
  const result = await chrome.storage.sync.get({
    projectMappings: {},
    defaultWorkspaceRoot: ''
  });
  return result;
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

  console.log('Opening in VS Code:', vscodeUri);

  try {
    // Use a hidden iframe or direct navigation to avoid popup
    // We'll send the URI back to content script to handle
    return { success: true, uri: vscodeUri };
  } catch (error) {
    console.error('Failed to open VS Code URI:', error);
    return { error: error.message };
  }
}

// Create context menus
chrome.runtime.onInstalled.addListener(() => {
  console.log('OpenGrok to VS Code extension installed');

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
});
