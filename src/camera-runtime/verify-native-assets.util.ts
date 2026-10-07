import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';







import { nativeAssets } from './native-assets.constant.js';

export function verifyNativeAssets(): Promise<void> {
  nativeAssets.value ??= (async () => {
    // pkg's CommonJS VM may not provide a dynamic import callback. Keep a
    // literal require for pkg and resolve relative to this module in ESM.
    // Only load the JS wrapper; the native addon belongs in the decoder child.
    const libav = (typeof require === 'function'
      ? require('@scrypted/libav')
      : createRequire(import.meta.url)('@scrypted/libav')) as typeof import('@scrypted/libav');
    await access(libav.getAddonPath());
  })().catch(error => { nativeAssets.value = undefined; throw error; });
  return nativeAssets.value;
}
