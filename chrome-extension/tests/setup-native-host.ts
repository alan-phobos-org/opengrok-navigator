/**
 * Global setup for native host integration tests
 *
 * This script:
 * 1. Builds the og_annotate binary to a temp directory
 * 2. Creates a native messaging manifest pointing to the test binary
 * 3. Exports paths for tests to use
 *
 * Usage in playwright.config.ts:
 *   globalSetup: './tests/setup-native-host.ts'
 */

import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Export paths for use in tests
export let NATIVE_HOST_BINARY: string;
export let NATIVE_HOST_MANIFEST: string;
export let NATIVE_HOST_TEMP_DIR: string;

/**
 * Build og_annotate and create native messaging manifest
 */
export default async function globalSetup() {
  // Skip native host setup if not running integration tests
  if (process.env.SKIP_NATIVE_HOST === '1') {
    console.log('Skipping native host setup (SKIP_NATIVE_HOST=1)');
    return;
  }

  const projectRoot = join(__dirname, '..', '..');
  const ogAnnotatePath = join(projectRoot, 'og_annotate');

  try {
    // Create temp directory for test artifacts
    NATIVE_HOST_TEMP_DIR = mkdtempSync(join(tmpdir(), 'og-annotate-test-'));
    NATIVE_HOST_BINARY = join(NATIVE_HOST_TEMP_DIR, 'og_annotate');

    console.log(`Setting up native host in ${NATIVE_HOST_TEMP_DIR}`);

    // Run Go tests first to catch any regressions
    console.log('Running og_annotate unit tests...');
    execSync('go test -v ./...', {
      cwd: ogAnnotatePath,
      stdio: 'inherit',
    });

    // Build the binary
    console.log('Building og_annotate binary...');
    execSync(`go build -o ${NATIVE_HOST_BINARY} .`, {
      cwd: ogAnnotatePath,
      stdio: 'inherit',
    });

    // Create native messaging manifest
    const manifest = {
      name: 'og_annotate',
      description: 'OpenGrok Annotation Storage Host (test)',
      path: NATIVE_HOST_BINARY,
      type: 'stdio',
      allowed_origins: ['chrome-extension://*/'], // Allow any extension ID for tests
    };

    NATIVE_HOST_MANIFEST = join(NATIVE_HOST_TEMP_DIR, 'og_annotate.json');
    writeFileSync(NATIVE_HOST_MANIFEST, JSON.stringify(manifest, null, 2));

    console.log(`Native host ready:`);
    console.log(`  Binary: ${NATIVE_HOST_BINARY}`);
    console.log(`  Manifest: ${NATIVE_HOST_MANIFEST}`);

    // Store paths in environment for tests to access
    process.env.NATIVE_HOST_BINARY = NATIVE_HOST_BINARY;
    process.env.NATIVE_HOST_MANIFEST = NATIVE_HOST_MANIFEST;
    process.env.NATIVE_HOST_TEMP_DIR = NATIVE_HOST_TEMP_DIR;

  } catch (error) {
    console.error('Failed to set up native host:', error);
    // Clean up on failure
    if (NATIVE_HOST_TEMP_DIR) {
      try {
        rmSync(NATIVE_HOST_TEMP_DIR, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}
