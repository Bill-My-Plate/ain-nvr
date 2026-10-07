import { createRequire } from 'node:module';


import type { LibavModule } from './libav-module.type.js';
import { preloadedModule } from './preloaded-module.constant.js';

/**
 * Preload the libav native addon through a literal require that pkg can detect.
 * Normal Node.js applications do not need to call this directly. The libav
 * runtime calls it automatically when it detects a pkg executable.
 */
export function preloadScryptedLibavNativeAddon(): LibavModule {
  if (preloadedModule.value !== undefined) {
    return preloadedModule.value;
  }

  if (typeof require === 'function') {
    const libav = require('@scrypted/libav') as LibavModule;
    const addon = require('@scrypted/libav/build/Release/addon.node');
    libav.loadAddon(undefined, (() => addon) as unknown as NodeRequire);
    preloadedModule.value = libav;
    return libav;
  }

  const nodeRequire = createRequire(import.meta.url);
  const libav = nodeRequire('@scrypted/libav') as LibavModule;
  const addon = nodeRequire('@scrypted/libav/build/Release/addon.node');
  libav.loadAddon(undefined, (() => addon) as unknown as NodeRequire);
  preloadedModule.value = libav;
  return libav;
}
