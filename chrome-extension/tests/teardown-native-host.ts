/**
 * Global teardown for native host integration tests
 *
 * Cleans up the temp directory created during setup.
 */

import { rmSync } from 'fs';

export default async function globalTeardown() {
  const tempDir = process.env.NATIVE_HOST_TEMP_DIR;

  if (tempDir) {
    console.log(`Cleaning up native host temp directory: ${tempDir}`);
    try {
      rmSync(tempDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  }
}
