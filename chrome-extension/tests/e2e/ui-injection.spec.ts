/**
 * UI Injection Tests
 *
 * Tests that the Chrome extension properly injects UI elements into OpenGrok pages.
 *
 * MAINTENANCE: Update these tests when modifying:
 * - content.js: floating button, toolbar, file finder
 * - annotations.js: annotation button in toolbar
 * - content.css: UI element classes and styling
 */

import { test, expect } from './fixtures';

test.describe('UI Injection', () => {
  test('injects floating toolbar on OpenGrok xref page', async ({ openGrokPage }) => {
    // The toolbar should be injected by content.js
    const toolbar = openGrokPage.locator('.vscode-button-toolbar');
    await expect(toolbar).toBeVisible();
  });

  test('floating toolbar contains VS Code open button', async ({ openGrokPage }) => {
    // The primary "Open in VS Code" button
    const openButton = openGrokPage.locator('.vscode-button-toolbar .vscode-open-btn');
    await expect(openButton).toBeVisible();

    // Should have a tooltip
    const title = await openButton.getAttribute('title');
    expect(title).toContain('VS Code');
  });

  test('floating toolbar contains file finder button', async ({ openGrokPage }) => {
    // File finder button (press 't' to activate)
    const finderButton = openGrokPage.locator('#og-finder-button');
    await expect(finderButton).toBeVisible();
  });

  test('floating toolbar contains annotation toggle button', async ({ openGrokPage }) => {
    // Annotation toggle button
    const annotationButton = openGrokPage.locator('#og-annotation-button');
    await expect(annotationButton).toBeVisible();
  });

  test('line numbers have VS Code click handlers', async ({ openGrokPage }) => {
    // Line number links should have the ctrl+click title
    const lineLink = openGrokPage.locator('a.l').first();
    await expect(lineLink).toBeVisible();

    // After content script runs, line links get a title attribute
    const title = await lineLink.getAttribute('title');
    expect(title).toContain('Ctrl+Click');
  });

  test('file finder modal opens on "t" keypress', async ({ openGrokPage }) => {
    // Press 't' to open file finder
    await openGrokPage.keyboard.press('t');

    // Modal should appear
    const modal = openGrokPage.locator('.vscode-finder-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Should have an input field
    const input = openGrokPage.locator('.vscode-finder-input');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();

    // Press Escape to close
    await openGrokPage.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });

  test('file finder modal can be closed by clicking outside', async ({ openGrokPage }) => {
    // Open file finder
    await openGrokPage.keyboard.press('t');
    const modal = openGrokPage.locator('.vscode-finder-modal');
    await expect(modal).toBeVisible();

    // Click outside the modal content (on the overlay)
    await openGrokPage.click('.vscode-finder-modal', { position: { x: 10, y: 10 } });

    // Modal should close
    await expect(modal).not.toBeVisible();
  });
});
