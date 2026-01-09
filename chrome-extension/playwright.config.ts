import { defineConfig } from '@playwright/test';

// Real OpenGrok server for testing
export const OPENGROK_BASE = 'https://src.illumos.org/source';
export const TEST_FILE_URL = `${OPENGROK_BASE}/xref/illumos-gate/usr/src/common/mpi/mpi.c`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000, // Longer timeout for real network requests
  retries: process.env.CI ? 2 : 0,

  use: {
    // New headless mode supports Chrome extensions (Chrome 109+)
    headless: 'new',

    // Increase timeouts for real server
    actionTimeout: 15000,
    navigationTimeout: 60000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        // Chrome extensions require chromium channel
        channel: 'chromium',
      },
    },
  ],
});
