/**
 * Playwright fixtures for Chrome extension testing
 *
 * MAINTENANCE NOTE: These tests must be updated when making changes to:
 * - content.js (UI injection, click handlers, keyboard shortcuts)
 * - annotations.js (annotation UI, create/delete/toggle)
 * - background.js (message handling)
 * - manifest.json (content script patterns, permissions)
 *
 * Run tests after any changes: npm test
 */

import { test as base, chromium, BrowserContext, Page } from '@playwright/test';
import path from 'path';

// Path to the Chrome extension (parent of tests directory)
const EXTENSION_PATH = path.join(__dirname, '..', '..');

// Real OpenGrok server for testing
export const OPENGROK_BASE = 'https://src.illumos.org/source';
export const TEST_FILE_URL = `${OPENGROK_BASE}/xref/illumos-gate/usr/src/common/mpi/mpi.c`;

export type TestFixtures = {
  context: BrowserContext;
  extensionId: string;
  openGrokPage: Page;
};

/**
 * Extended test with Chrome extension loaded
 */
export const test = base.extend<TestFixtures>({
  // Launch browser with extension loaded
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false, // Required for launchPersistentContext API
      args: [
        '--headless=new', // New headless mode supports extensions (Chrome 109+)
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // Disable various Chrome features that can interfere with tests
        '--disable-background-networking',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--no-first-run',
      ],
    });

    await use(context);
    await context.close();
  },

  // Get the extension ID from the service worker
  extensionId: async ({ context }, use) => {
    // Wait for service worker to be registered
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    // Extract extension ID from service worker URL
    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },

  // Navigate to a real OpenGrok page with extension loaded
  openGrokPage: async ({ context }, use) => {
    const page = await context.newPage();

    // Set up chrome.storage and chrome.runtime mocks in the main world
    // This allows tests to use page.evaluate() with chrome APIs
    await mockChromeStorage(page);

    // Navigate to real OpenGrok server
    await page.goto(TEST_FILE_URL);

    // Wait for content script to inject UI elements
    await page.waitForSelector('.vscode-button-toolbar', { timeout: 15000 });

    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * Alias for live tests (same as test, but semantic separation)
 */
export const liveTest = test;

/**
 * Helper to configure extension settings via chrome.storage
 */
export async function configureExtension(
  context: BrowserContext,
  extensionId: string,
  settings: {
    projectMappings?: Record<string, string>;
    defaultWorkspaceRoot?: string;
    openGrokRoots?: string[];
    annotationsStoragePath?: string;
    annotationsAuthorName?: string;
  }
) {
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

  // Wait for page to load
  await optionsPage.waitForLoadState('domcontentloaded');

  // Fill in settings based on what's provided
  if (settings.projectMappings) {
    for (const [project, localPath] of Object.entries(settings.projectMappings)) {
      // Click "Add Mapping" button to add a new row
      await optionsPage.click('#addMapping');
      // Wait for the new row to appear
      await optionsPage.waitForSelector('#mappings .mapping:last-child');
      // Fill in the inputs in the last mapping row
      const lastRow = optionsPage.locator('#mappings .mapping').last();
      const inputs = lastRow.locator('input');
      await inputs.nth(0).fill(project);
      await inputs.nth(1).fill(localPath);
    }
  }

  if (settings.defaultWorkspaceRoot) {
    await optionsPage.fill('#defaultWorkspaceRoot', settings.defaultWorkspaceRoot);
  }

  // Settings auto-save after input changes, wait for debounce
  await optionsPage.waitForTimeout(600);

  await optionsPage.close();
}

/**
 * Helper to intercept and capture vscode:// protocol attempts
 *
 * Since we can't actually open VS Code in tests, we intercept the protocol
 * and capture what URI would have been opened.
 */
export async function captureVSCodeProtocol(page: Page): Promise<string[]> {
  const capturedUris: string[] = [];

  // Intercept navigation to vscode:// URLs
  await page.route('vscode://**', async (route) => {
    capturedUris.push(route.request().url());
    await route.abort();
  });

  return capturedUris;
}

/**
 * Helper to mock chrome.storage API for tests
 *
 * The chrome.storage API is only available in the content script's isolated world,
 * not in the page's main world where page.evaluate() runs. This mock provides a
 * compatible API in the main world so tests can use chrome.storage without errors.
 *
 * Note: This mock does NOT affect the content script's real chrome.storage.
 * The content script will still use default values or show config dialogs.
 */
export async function mockChromeStorage(page: Page, initialValues?: {
  sync?: Record<string, any>;
  local?: Record<string, any>;
}) {
  await page.addInitScript((init) => {
    // In-memory storage
    const syncStorage: Record<string, any> = init?.sync || {};
    const localStorage: Record<string, any> = init?.local || {};

    function createStorageArea(storage: Record<string, any>) {
      return {
        get(keys: string | string[] | Record<string, any> | null, callback?: (items: Record<string, any>) => void) {
          let result: Record<string, any> = {};

          if (keys === null) {
            result = { ...storage };
          } else if (typeof keys === 'string') {
            result[keys] = storage[keys];
          } else if (Array.isArray(keys)) {
            for (const key of keys) {
              result[key] = storage[key];
            }
          } else if (typeof keys === 'object') {
            // keys is a defaults object
            for (const [key, defaultValue] of Object.entries(keys)) {
              result[key] = key in storage ? storage[key] : defaultValue;
            }
          }

          if (callback) {
            callback(result);
          }
          return Promise.resolve(result);
        },
        set(items: Record<string, any>, callback?: () => void) {
          Object.assign(storage, items);
          if (callback) callback();
          return Promise.resolve();
        },
        remove(keys: string | string[], callback?: () => void) {
          const keyList = typeof keys === 'string' ? [keys] : keys;
          for (const key of keyList) {
            delete storage[key];
          }
          if (callback) callback();
          return Promise.resolve();
        },
        clear(callback?: () => void) {
          for (const key of Object.keys(storage)) {
            delete storage[key];
          }
          if (callback) callback();
          return Promise.resolve();
        }
      };
    }

    // Create mock chrome object if it doesn't exist
    if (typeof (window as any).chrome === 'undefined') {
      (window as any).chrome = {};
    }
    if (!(window as any).chrome.storage) {
      (window as any).chrome.storage = {
        sync: createStorageArea(syncStorage),
        local: createStorageArea(localStorage)
      };
    }
    // Also mock chrome.runtime for native messaging mock compatibility
    if (!(window as any).chrome.runtime) {
      (window as any).chrome.runtime = {
        sendMessage: (message: any, callback?: (response: any) => void) => {
          // Default no-op implementation, overridden by mockNativeMessaging
          if (callback) callback({ success: false, error: 'No mock handler' });
        },
        lastError: null
      };
    }

    // Expose storage for test assertions
    (window as any).__mockChromeStorage = { sync: syncStorage, local: localStorage };
  }, initialValues);
}

/**
 * Helper to mock native messaging for annotation tests
 *
 * The og_annotate native host can't run in tests, so we mock the responses.
 */
export async function mockNativeMessaging(page: Page) {
  // First set up chrome.storage mock (needed for chrome.runtime to exist)
  await mockChromeStorage(page);

  await page.addInitScript(() => {
    // Store mock annotations in memory
    const mockAnnotations: Record<string, any[]> = {};

    // Override chrome.runtime.sendMessage for annotation messages
    const originalSendMessage = chrome.runtime.sendMessage;

    chrome.runtime.sendMessage = function (message: any, callback?: (response: any) => void) {
      // Handle annotation-related messages
      if (message.action?.startsWith('annotation:')) {
        const key = `${message.project}/${message.filePath}`;

        switch (message.action) {
          case 'annotation:ping':
            callback?.({ success: true });
            return;

          case 'annotation:load':
            callback?.({ success: true, annotations: mockAnnotations[key] || [] });
            return;

          case 'annotation:save':
            // CRITICAL: Source code must be provided
            if (!message.source || typeof message.source !== 'string' || message.source.length === 0) {
              callback?.({ success: false, error: 'Source code is required for saving annotations' });
              return;
            }
            if (!mockAnnotations[key]) mockAnnotations[key] = [];
            const existing = mockAnnotations[key].findIndex((a) => a.line === message.line);
            const ann = {
              line: message.line,
              content: message.content,
              author: message.author || 'Test User',
              timestamp: new Date().toISOString(),
              source: message.source, // Store for test verification
            };
            if (existing >= 0) {
              mockAnnotations[key][existing] = ann;
            } else {
              mockAnnotations[key].push(ann);
            }
            callback?.({ success: true });
            return;

          case 'annotation:delete':
            if (mockAnnotations[key]) {
              mockAnnotations[key] = mockAnnotations[key].filter((a) => a.line !== message.line);
            }
            callback?.({ success: true });
            return;

          case 'annotation:startEditing':
          case 'annotation:stopEditing':
            callback?.({ success: true });
            return;
        }
      }

      // Fall through to original for non-annotation messages
      return originalSendMessage.call(chrome.runtime, message, callback);
    };

    // Expose mock annotations for test assertions
    (window as any).__mockAnnotations = mockAnnotations;
  });
}
