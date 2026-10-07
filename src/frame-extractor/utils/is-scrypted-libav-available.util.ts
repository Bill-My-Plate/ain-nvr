import { createRequire } from 'node:module';


export function isScryptedLibavAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('@scrypted/libav');
    return true;
  } catch {
    return false;
  }
}
