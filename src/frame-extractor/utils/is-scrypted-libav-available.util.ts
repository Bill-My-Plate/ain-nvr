import { createRequire } from 'node:module';
/**
 * Reports whether the Scrypted libav native addon can be loaded.
 */
export function isScryptedLibavAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('@scrypted/libav');
    return true;
  } catch {
    return false;
  }
}
