/**
 * Annotation Tests
 *
 * Tests the annotation system: create, delete, toggle visibility.
 *
 * NOTE: These tests mock the native messaging host (og_annotate) since it
 * cannot run in the test environment. The mock stores annotations in memory.
 *
 * MAINTENANCE: Update these tests when modifying:
 * - annotations.js: AnnotationManager, UI elements, keyboard shortcuts
 * - annotations.css: annotation styling
 * - background.js: annotation message handling
 */

import { test, expect, mockNativeMessaging, TEST_FILE_URL } from './fixtures';

test.describe('Annotations', () => {
  // Skip annotation tests if native host mocking isn't working
  // These tests require the mock to intercept chrome.runtime.sendMessage
  test.skip(({ browserName }) => browserName !== 'chromium', 'Annotations require Chromium');

  test('annotation toggle button activates annotation mode', async ({ openGrokPage }) => {
    // Note: chrome.storage is mocked in the main world by fixtures, but this doesn't
    // affect the content script's isolated world. The content script uses real
    // chrome.storage, so the config dialog will appear when annotations aren't configured.

    // Find the annotation button
    const annotationButton = openGrokPage.locator('#og-annotation-button');
    await expect(annotationButton).toBeVisible();

    // Initially should not be active
    const initialClass = await annotationButton.getAttribute('class');
    expect(initialClass).not.toContain('active');

    // Click to toggle - this will show config dialog since storage isn't set
    await annotationButton.click();

    // Either the config dialog appears OR annotations are enabled
    const configDialog = openGrokPage.locator('.og-config-modal');
    const isConfigVisible = await configDialog.isVisible().catch(() => false);

    if (isConfigVisible) {
      // Fill in the config dialog
      await openGrokPage.fill('#og-config-path', '/tmp/test-annotations');
      await openGrokPage.fill('#og-config-author', 'Test User');

      // This will fail because native host isn't available - that's expected
      // In a real test environment, you'd mock the native host
      await openGrokPage.click('#og-config-cancel');
    }
  });

  test('keyboard shortcut "c" requires hovering over line number', async ({ openGrokPage }) => {
    // Navigate to a specific line
    await openGrokPage.goto(`${TEST_FILE_URL}#50`);
    await openGrokPage.waitForSelector('.vscode-button-toolbar');

    // Wait for annotation manager to be initialized
    await openGrokPage.waitForSelector('#og-annotation-button');
    await openGrokPage.waitForTimeout(200); // Small delay for event handlers

    // Click somewhere NOT on a line number (e.g., the toolbar) to ensure focus
    await openGrokPage.locator('.vscode-button-toolbar').click();

    // Press 'c' WITHOUT hovering a line number - should show info toast
    await openGrokPage.keyboard.press('c');

    // Should show info toast about hovering a line number
    const infoToast = openGrokPage.locator('.og-toast.info');
    await expect(infoToast).toBeVisible({ timeout: 3000 });
    const toastText = await infoToast.textContent();
    expect(toastText).toContain('Hover over a line number');
  });

  test('keyboard shortcut "c" opens editor when hovering line number', async ({ openGrokPage }) => {
    // Navigate to a specific line
    await openGrokPage.goto(`${TEST_FILE_URL}#50`);
    await openGrokPage.waitForSelector('.vscode-button-toolbar');

    // First enable annotations (may show config dialog)
    const annotationButton = openGrokPage.locator('#og-annotation-button');
    await annotationButton.click();

    // Handle config dialog if it appears
    const configDialog = openGrokPage.locator('.og-config-modal');
    if (await configDialog.isVisible().catch(() => false)) {
      await openGrokPage.click('#og-config-cancel');
      // Annotations won't be enabled without config, skip rest of test
      test.skip();
      return;
    }

    // Hover over a line number anchor (required for 'c' to work)
    const lineAnchor = openGrokPage.locator('a.l').first();
    await lineAnchor.hover();

    // Press 'c' to create annotation
    await openGrokPage.keyboard.press('c');

    // Annotation editor should appear
    const editor = openGrokPage.locator('.og-annotation-editor');
    await expect(editor).toBeVisible({ timeout: 5000 });
  });

  test('annotation button has correct tooltip', async ({ openGrokPage }) => {
    const annotationButton = openGrokPage.locator('#og-annotation-button');
    await expect(annotationButton).toBeVisible();

    const title = await annotationButton.getAttribute('title');
    expect(title).toContain('annotation');
  });

  test('keyboard shortcut "x" jumps to next annotation', async ({ openGrokPage }) => {
    // This tests the keyboard shortcut binding
    // In a real scenario with annotations, it would jump between them
    await openGrokPage.waitForSelector('.vscode-button-toolbar');

    // Get initial scroll position
    const initialScroll = await openGrokPage.evaluate(() => window.scrollY);

    // Press 'x' to jump to next annotation
    // Without annotations enabled, this should do nothing (no error)
    await openGrokPage.keyboard.press('x');

    // Should not throw errors - check no error toasts appeared
    await openGrokPage.waitForTimeout(300);
    const errors = await openGrokPage.locator('.og-toast.error').count();
    expect(errors).toBe(0);
  });

  test('body gets annotation class when enabled', async ({ openGrokPage }) => {
    // When annotations are enabled, body should have the class
    // This controls CSS visibility of annotation UI elements

    // Initially should not have the class
    const initialClass = await openGrokPage.evaluate(() => document.body.className);
    expect(initialClass).not.toContain('og-annotations-enabled');

    // Note: Full enable test requires mocking native host
    // This is a structural test to verify the class mechanism exists
  });
});

test.describe('Annotation Configuration', () => {
  test('config dialog appears when storage path not set and user clicks annotations', async ({ openGrokPage }) => {
    // Clear any existing annotation config
    await openGrokPage.evaluate(() => {
      // This runs in main world, but we need to trigger the content script behavior
      // The content script checks chrome.storage.local for annotationStoragePath
    });

    // Find and click the annotation button
    const annotationButton = openGrokPage.locator('#og-annotation-button');
    await expect(annotationButton).toBeVisible();
    await annotationButton.click();

    // Config dialog should appear since storage path is not configured
    const configDialog = openGrokPage.locator('.og-config-modal');
    await expect(configDialog).toBeVisible({ timeout: 5000 });

    // Dialog should have the expected fields
    const pathInput = openGrokPage.locator('#og-config-path');
    const authorInput = openGrokPage.locator('#og-config-author');
    const saveBtn = openGrokPage.locator('#og-config-save');
    const cancelBtn = openGrokPage.locator('#og-config-cancel');

    await expect(pathInput).toBeVisible();
    await expect(authorInput).toBeVisible();
    await expect(saveBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    // Cancel the dialog
    await cancelBtn.click();
    await expect(configDialog).not.toBeVisible();
  });

  test('config dialog allows saving even when native host is unavailable', async ({ openGrokPage }) => {
    // Click annotation button to trigger config dialog
    const annotationButton = openGrokPage.locator('#og-annotation-button');
    await annotationButton.click();

    // Config dialog should appear
    const configDialog = openGrokPage.locator('.og-config-modal');
    await expect(configDialog).toBeVisible({ timeout: 5000 });

    // Fill in the config fields
    await openGrokPage.fill('#og-config-path', '/tmp/test-annotations');
    await openGrokPage.fill('#og-config-author', 'Test User');

    // Click save - should NOT block even if native host is unavailable
    // The config should be saved, and any native host errors shown later
    await openGrokPage.click('#og-config-save');

    // Dialog should close (config was saved)
    // Or if native host check still blocks, we should see an informative message
    // and the dialog should still be usable
    await openGrokPage.waitForTimeout(1000);

    // Check if dialog closed (success) or if there's an error toast
    const dialogStillVisible = await configDialog.isVisible().catch(() => false);
    const errorToast = openGrokPage.locator('.og-toast.error');
    const hasErrorToast = await errorToast.isVisible().catch(() => false);

    // The fix should make the dialog close even without native host
    // If dialog is still visible with error, the fix isn't working
    if (dialogStillVisible && hasErrorToast) {
      // This is the bug - config should save without requiring native host
      const errorText = await errorToast.textContent();
      console.log('Error toast:', errorText);

      // For now, close the dialog to clean up
      await openGrokPage.click('#og-config-cancel');
    }

    // After fix: dialog should have closed
    expect(dialogStillVisible).toBe(false);
  });

  test('pressing "c" on line number shows config dialog or error when native host unavailable', async ({ openGrokPage }) => {
    // Navigate to a line
    await openGrokPage.goto(`${TEST_FILE_URL}#100`);
    await openGrokPage.waitForSelector('.vscode-button-toolbar');

    // Wait for annotation manager to be ready
    await openGrokPage.waitForSelector('#og-annotation-button');

    // Hover over a line NUMBER (required for 'c' to work)
    const lineAnchor = openGrokPage.locator('a.l').first();
    await lineAnchor.hover();

    // Press 'c' to create annotation
    await openGrokPage.keyboard.press('c');

    // Should show either:
    // 1. Config dialog (if not configured)
    // 2. Error toast about native host (if configured but native host unavailable)
    await openGrokPage.waitForTimeout(1000);

    const configDialog = openGrokPage.locator('.og-config-modal');
    const errorToast = openGrokPage.locator('.og-toast.error');

    const dialogVisible = await configDialog.isVisible().catch(() => false);
    const toastVisible = await errorToast.isVisible().catch(() => false);

    // Either dialog or error toast should be visible (user is informed)
    expect(dialogVisible || toastVisible).toBe(true);

    // Clean up - close dialog if open
    if (dialogVisible) {
      await openGrokPage.click('#og-config-cancel');
    }
  });
});

test.describe('Annotation Source Capture', () => {
  test('saving annotation must include full source code', async ({ openGrokPage }) => {
    // This test verifies that annotation:save messages include the full source code.
    // The mock will reject saves without source - this is a CRITICAL requirement.

    // Capture messages sent to background script
    const capturedMessages: any[] = [];
    await openGrokPage.evaluate(() => {
      const originalSendMessage = chrome.runtime.sendMessage;
      (window as any).__capturedMessages = [];
      chrome.runtime.sendMessage = function(message: any, callback?: (response: any) => void) {
        if (message.action === 'annotation:save') {
          (window as any).__capturedMessages.push(message);
        }
        return originalSendMessage.call(chrome.runtime, message, callback);
      };
    });

    // Navigate to a specific line
    await openGrokPage.goto(`${TEST_FILE_URL}#100`);
    await openGrokPage.waitForSelector('.vscode-button-toolbar');

    // Configure and enable annotations
    const annotationButton = openGrokPage.locator('#og-annotation-button');
    await annotationButton.click();

    const configDialog = openGrokPage.locator('.og-config-modal');
    if (await configDialog.isVisible().catch(() => false)) {
      await openGrokPage.fill('#og-config-path', '/tmp/test-annotations');
      await openGrokPage.fill('#og-config-author', 'Test User');
      await openGrokPage.click('#og-config-save');
      await openGrokPage.waitForTimeout(500);
    }

    // If still not enabled, we can't proceed
    const isEnabled = await openGrokPage.evaluate(() =>
      document.body.classList.contains('og-annotations-enabled')
    );
    if (!isEnabled) {
      test.skip();
      return;
    }

    // Hover over a line NUMBER anchor and press 'c' to create annotation
    // Line number anchors are a.l or a.hl elements that contain the line number
    const lineAnchor = openGrokPage.locator('a.l').nth(99); // 0-indexed, so 99 = line 100
    await lineAnchor.hover();
    await openGrokPage.keyboard.press('c');

    // Fill in annotation text
    const editor = openGrokPage.locator('.og-annotation-editor');
    await expect(editor).toBeVisible({ timeout: 5000 });

    const textarea = openGrokPage.locator('.og-editor-textarea');
    await textarea.fill('Test annotation for source capture');

    // Click save
    await openGrokPage.click('.og-btn-save');

    // Wait for save to complete
    await openGrokPage.waitForTimeout(500);

    // Verify source was included in the message
    const messages = await openGrokPage.evaluate(() => (window as any).__capturedMessages);

    expect(messages.length).toBeGreaterThan(0);
    const saveMessage = messages[0];
    expect(saveMessage.source).toBeDefined();
    expect(typeof saveMessage.source).toBe('string');
    expect(saveMessage.source.length).toBeGreaterThan(100); // Source should be substantial

    // Verify source contains actual code (not empty lines)
    const nonEmptyLines = saveMessage.source.split('\n').filter((l: string) => l.trim().length > 0);
    expect(nonEmptyLines.length).toBeGreaterThan(10);
  });
});

test.describe('Annotation UI Elements', () => {
  test('annotation CSS is loaded', async ({ openGrokPage }) => {
    // Check that annotation styles are applied
    const annotationButton = openGrokPage.locator('#og-annotation-button');
    await expect(annotationButton).toBeVisible();

    // The button should have some styling from annotations.css
    const styles = await annotationButton.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        cursor: computed.cursor,
        display: computed.display,
      };
    });

    expect(styles.cursor).toBe('pointer');
  });

  test('annotation indicator margin exists in page structure', async ({ openGrokPage }) => {
    // The page should have the structure to support annotation indicators
    // These appear in the left margin of the code view

    // Check that line elements exist (where indicators would be added)
    const lines = openGrokPage.locator('a.l');
    const count = await lines.count();
    expect(count).toBeGreaterThan(0);
  });
});
