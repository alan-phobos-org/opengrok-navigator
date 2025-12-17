// Load saved settings
async function loadSettings() {
  const syncResult = await chrome.storage.sync.get({
    projectMappings: {},
    defaultWorkspaceRoot: ''
  });

  const localResult = await chrome.storage.local.get({
    experimentalFileFinder: false
  });

  document.getElementById('defaultWorkspaceRoot').value = syncResult.defaultWorkspaceRoot;
  document.getElementById('experimentalFileFinder').checked = localResult.experimentalFileFinder;

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
  const experimentalFileFinder = document.getElementById('experimentalFileFinder').checked;

  await chrome.storage.sync.set({
    projectMappings: mappings,
    defaultWorkspaceRoot: defaultRoot
  });

  await chrome.storage.local.set({
    experimentalFileFinder: experimentalFileFinder
  });

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
