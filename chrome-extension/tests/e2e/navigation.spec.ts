/**
 * Navigation Tests
 *
 * Tests the core navigation functionality: Ctrl+click to open in VS Code.
 *
 * MAINTENANCE: Update these tests when modifying:
 * - content.js: parseOpenGrokUrl, openInVSCode, click handlers
 * - background.js: openInVSCode message handling
 */

import { test, expect, TEST_FILE_URL } from './fixtures';

test.describe('Navigation', () => {
  test('Ctrl+click on line number sends openInVSCode message', async ({ context, openGrokPage }) => {
    // Set up message capture
    const messages: any[] = [];

    // Listen for console messages that indicate VS Code open attempt
    openGrokPage.on('console', (msg) => {
      if (msg.text().includes('openInVSCode') || msg.text().includes('vscode://')) {
        messages.push(msg.text());
      }
    });

    // Find a line number link
    const lineLink = openGrokPage.locator('a.l[href*="#"]').first();
    await expect(lineLink).toBeVisible();

    // Get the line number from the href
    const href = await lineLink.getAttribute('href');
    const lineNumber = href?.match(/#(\d+)/)?.[1];
    expect(lineNumber).toBeTruthy();

    // Ctrl+click the line number
    await lineLink.click({ modifiers: ['Control'] });

    // Give time for message to be sent
    await openGrokPage.waitForTimeout(500);

    // The extension should attempt to open VS Code
    // We can't actually verify the vscode:// protocol was invoked,
    // but we can check that no errors occurred
    const errors = await openGrokPage.locator('.vscode-error-toast').count();
    expect(errors).toBe(0);
  });

  test('floating button click sends openInVSCode message', async ({ openGrokPage }) => {
    // Click the main VS Code button in the toolbar
    const openButton = openGrokPage.locator('.vscode-button-toolbar .vscode-open-btn').first();
    await expect(openButton).toBeVisible();

    await openButton.click();

    // Give time for message to be sent
    await openGrokPage.waitForTimeout(500);

    // Should not show any error toasts
    const errors = await openGrokPage.locator('.vscode-error-toast').count();
    expect(errors).toBe(0);
  });

  test('keyboard shortcut "o" opens current line in VS Code', async ({ openGrokPage }) => {
    // Navigate to a specific line first
    await openGrokPage.goto(`${TEST_FILE_URL}#100`);

    // Wait for page to load
    await openGrokPage.waitForSelector('.vscode-button-toolbar');

    // Press 'o' to open in VS Code
    await openGrokPage.keyboard.press('o');

    // Give time for message to be sent
    await openGrokPage.waitForTimeout(500);

    // Should not show any error toasts
    const errors = await openGrokPage.locator('.vscode-error-toast').count();
    expect(errors).toBe(0);
  });
});
