// Auto-save debounce timer
let autoSaveTimer = null;

// Load saved settings
async function loadSettings() {
  const syncResult = await chrome.storage.sync.get({
    projectMappings: {},
    defaultWorkspaceRoot: '',
    darkModeEnabled: false
  });

  document.getElementById('defaultWorkspaceRoot').value = syncResult.defaultWorkspaceRoot;
  document.getElementById('darkModeEnabled').checked = syncResult.darkModeEnabled;

  const mappingsDiv = document.getElementById('mappings');
  mappingsDiv.innerHTML = '';

  for (const [project, path] of Object.entries(syncResult.projectMappings)) {
    addMappingRow(project, path);
  }

  if (Object.keys(syncResult.projectMappings).length === 0) {
    addMappingRow('', '');
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

// Auto-save with debouncing
function autoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveSettings();
  }, 500); // Wait 500ms after last change before saving
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
  const darkModeEnabled = document.getElementById('darkModeEnabled').checked;

  await chrome.storage.sync.set({
    projectMappings: mappings,
    defaultWorkspaceRoot: defaultRoot,
    darkModeEnabled: darkModeEnabled
  });

  // Settings saved silently - no status message needed
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  // Auto-save listeners
  document.getElementById('defaultWorkspaceRoot').addEventListener('input', () => autoSave());
  document.getElementById('darkModeEnabled').addEventListener('change', () => autoSave());
  document.getElementById('addMapping').addEventListener('click', () => addMappingRow());
});
