// Auto-save debounce timer
let autoSaveTimer = null;

// Load saved settings
async function loadSettings() {
  // Load local storage (machine-specific)
  const localResult = await chrome.storage.local.get({
    annotationStoragePath: ''
  });

  // Load sync storage (synced across devices)
  const syncResult = await chrome.storage.sync.get({
    projectMappings: {},
    defaultWorkspaceRoot: '',
    darkModeEnabled: false,
    annotationAuthorName: '',
    annotationPollInterval: 10,
    openGrokRoots: [],
    debugLogLevel: 'OFF'
  });

  document.getElementById('defaultWorkspaceRoot').value = syncResult.defaultWorkspaceRoot;
  document.getElementById('darkModeEnabled').checked = syncResult.darkModeEnabled;
  document.getElementById('debugLogLevel').value = syncResult.debugLogLevel;

  // Annotation settings
  document.getElementById('annotationStoragePath').value = localResult.annotationStoragePath;
  document.getElementById('annotationAuthorName').value = syncResult.annotationAuthorName;
  document.getElementById('annotationPollInterval').value = syncResult.annotationPollInterval;

  // Apply dark mode to options page itself
  if (syncResult.darkModeEnabled) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }

  // Load project mappings
  const mappingsDiv = document.getElementById('mappings');
  mappingsDiv.innerHTML = '';

  for (const [project, path] of Object.entries(syncResult.projectMappings)) {
    addMappingRow(project, path);
  }

  if (Object.keys(syncResult.projectMappings).length === 0) {
    addMappingRow('', '');
  }

  // Load URL roots
  const urlRootsDiv = document.getElementById('urlRoots');
  urlRootsDiv.innerHTML = '';

  const roots = syncResult.openGrokRoots || [];
  for (const root of roots) {
    addUrlRootRow(root);
  }
}

// Add a mapping row
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
  removeBtn.className = 'remove-btn';

  // Function to update remove button visibility
  const updateRemoveButton = () => {
    const hasContent = projectInput.value.trim() !== '' || pathInput.value.trim() !== '';
    removeBtn.style.display = hasContent ? 'block' : 'none';
  };

  // Set initial visibility
  updateRemoveButton();

  // Update visibility and auto-save when inputs change
  projectInput.addEventListener('input', () => {
    updateRemoveButton();
    autoSave();
  });

  pathInput.addEventListener('input', () => {
    updateRemoveButton();
    autoSave();
  });

  removeBtn.onclick = () => {
    row.remove();
    autoSave();
  };

  row.appendChild(projectInput);
  row.appendChild(pathInput);
  row.appendChild(removeBtn);
  mappingsDiv.appendChild(row);
}

// Add a URL root row
function addUrlRootRow(url = '') {
  const urlRootsDiv = document.getElementById('urlRoots');
  const row = document.createElement('div');
  row.className = 'mapping';

  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.placeholder = 'OpenGrok root URL (e.g., https://opengrok.example.com/code)';
  urlInput.value = url;
  urlInput.style.flex = '2';

  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove';
  removeBtn.className = 'remove-btn';

  // Function to update remove button visibility
  const updateRemoveButton = () => {
    const hasContent = urlInput.value.trim() !== '';
    removeBtn.style.display = hasContent ? 'block' : 'none';
  };

  // Set initial visibility
  updateRemoveButton();

  // Update visibility and auto-save when input changes
  urlInput.addEventListener('input', () => {
    updateRemoveButton();
    autoSave();
  });

  removeBtn.onclick = () => {
    row.remove();
    autoSave();
  };

  row.appendChild(urlInput);
  row.appendChild(removeBtn);
  urlRootsDiv.appendChild(row);
}

// Auto-save with debouncing
function autoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveSettings();
  }, 500); // Wait 500ms after last change before saving
}

// Validate URL format
function isValidUrl(string) {
  if (!string || !string.trim()) return false;
  try {
    const url = new URL(string.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Save settings
async function saveSettings() {
  const mappings = {};
  const mappingRows = document.querySelectorAll('#mappings .mapping');

  mappingRows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const project = inputs[0].value.trim();
    const path = inputs[1].value.trim();

    if (project && path) {
      mappings[project] = path;
    }
  });

  // Collect URL roots
  const urlRoots = [];
  const urlRootRows = document.querySelectorAll('#urlRoots .mapping');

  urlRootRows.forEach(row => {
    const input = row.querySelector('input');
    const url = input.value.trim();

    if (url) {
      // Validate URL format
      if (isValidUrl(url)) {
        urlRoots.push(url);
        input.style.borderColor = '';
      } else {
        // Mark invalid URL
        input.style.borderColor = '#dc3545';
      }
    }
  });

  const defaultRoot = document.getElementById('defaultWorkspaceRoot').value.trim();
  const darkModeEnabled = document.getElementById('darkModeEnabled').checked;
  const debugLogLevel = document.getElementById('debugLogLevel').value;

  // Annotation settings
  const annotationStoragePath = document.getElementById('annotationStoragePath').value.trim();
  const annotationAuthorName = document.getElementById('annotationAuthorName').value.trim();
  const annotationPollInterval = parseInt(document.getElementById('annotationPollInterval').value, 10) || 10;

  // Save local storage (machine-specific)
  await chrome.storage.local.set({
    annotationStoragePath: annotationStoragePath
  });

  // Save sync storage (synced across devices)
  await chrome.storage.sync.set({
    projectMappings: mappings,
    defaultWorkspaceRoot: defaultRoot,
    darkModeEnabled: darkModeEnabled,
    annotationAuthorName: annotationAuthorName,
    annotationPollInterval: annotationPollInterval,
    openGrokRoots: urlRoots,
    debugLogLevel: debugLogLevel
  });

  // Apply dark mode to options page itself
  if (darkModeEnabled) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }

  // Settings saved silently - no status message needed
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  // Auto-save listeners
  document.getElementById('defaultWorkspaceRoot').addEventListener('input', () => autoSave());
  document.getElementById('darkModeEnabled').addEventListener('change', () => autoSave());
  document.getElementById('debugLogLevel').addEventListener('change', () => autoSave());
  document.getElementById('addMapping').addEventListener('click', () => addMappingRow());
  document.getElementById('addUrlRoot').addEventListener('click', () => addUrlRootRow());

  // Annotation auto-save listeners
  document.getElementById('annotationStoragePath').addEventListener('input', () => autoSave());
  document.getElementById('annotationAuthorName').addEventListener('input', () => autoSave());
  document.getElementById('annotationPollInterval').addEventListener('input', () => autoSave());
});
