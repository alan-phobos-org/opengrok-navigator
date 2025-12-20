// Dark Mode Early Initialization
// This script runs at document_start (before DOM construction) to prevent FOUC
// It sets the data-theme attribute synchronously before any rendering occurs

(function() {
  'use strict';

  // Synchronous check from localStorage (set by previous page loads)
  const cached = localStorage.getItem('darkModeEnabled');
  if (cached === 'true') {
    document.documentElement.dataset.theme = 'dark';
  }

  // Async update from chrome.storage for correctness (handles settings changes)
  // This runs after the sync check, so it only matters if the setting changed
  chrome.storage.sync.get(['darkModeEnabled'], (result) => {
    const enabled = result.darkModeEnabled || false;

    // Update localStorage cache for next page load
    localStorage.setItem('darkModeEnabled', enabled.toString());

    // Apply current setting (may differ from cached if user just changed it)
    if (enabled) {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
  });

  // Listen for real-time changes from options page
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.darkModeEnabled) {
      const enabled = changes.darkModeEnabled.newValue;
      localStorage.setItem('darkModeEnabled', enabled.toString());

      if (enabled) {
        document.documentElement.dataset.theme = 'dark';
      } else {
        delete document.documentElement.dataset.theme;
      }
    }
  });
})();
