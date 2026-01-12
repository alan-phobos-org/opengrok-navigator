/**
 * Live Smoke Tests
 *
 * These tests run against the real OpenGrok server to catch upstream HTML drift.
 * They are skipped by default and only run when RUN_LIVE_TESTS=1 is set.
 *
 * Usage:
 *   RUN_LIVE_TESTS=1 npm test -- smoke.spec.ts
 */

import { liveTest as test, expect, TEST_FILE_URL, OPENGROK_BASE } from './fixtures';

test.describe('Live OpenGrok Smoke Tests', () => {
  test.skip(!process.env.RUN_LIVE_TESTS, 'Live tests disabled (set RUN_LIVE_TESTS=1 to enable)');

  test('illumos.org is accessible', async ({ openGrokPage }) => {
    // Page should have loaded
    await expect(openGrokPage).toHaveURL(new RegExp(OPENGROK_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('page has source code pre element', async ({ openGrokPage }) => {
    const pre = openGrokPage.locator('pre');
    await expect(pre).toBeVisible();
  });

  test('page has line number links', async ({ openGrokPage }) => {
    // OpenGrok uses a.l for line number links
    const lineLinks = openGrokPage.locator('a.l, a.hl');
    const count = await lineLinks.count();
    expect(count).toBeGreaterThan(10);
  });

  test('extension toolbar is injected', async ({ openGrokPage }) => {
    const toolbar = openGrokPage.locator('.vscode-button-toolbar');
    await expect(toolbar).toBeVisible();
  });

  test('line links have ctrl+click handlers', async ({ openGrokPage }) => {
    const lineLink = openGrokPage.locator('a.l').first();
    const title = await lineLink.getAttribute('title');
    expect(title).toContain('Ctrl+Click');
  });

  test('raw source endpoint works', async ({ context }) => {
    // Test that the /raw/ endpoint returns source code
    const page = await context.newPage();
    const rawUrl = TEST_FILE_URL.replace('/xref/', '/raw/');
    const response = await page.goto(rawUrl);

    expect(response?.status()).toBe(200);

    const content = await page.content();
    // Should contain C code
    expect(content).toContain('#include');
    await page.close();
  });
});
