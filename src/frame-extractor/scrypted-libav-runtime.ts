import { createRequire } from 'node:module';

import type {
  LibavFormatContextLike,
  LibavFrameLike,
  LibavRuntime,
} from './libav-types.js';

type LibavModule = typeof import('@scrypted/libav');
type PkgProcess = NodeJS.Process & { pkg?: unknown };

let loadedModule: LibavModule | undefined;
let preloadedModule: LibavModule | undefined;
let initialization: Promise<void> | undefined;

/**
 * Preload the libav native addon through a literal require that pkg can detect.
 * Normal Node.js applications do not need to call this directly. The libav
 * runtime calls it automatically when it detects a pkg executable.
 */
export function preloadScryptedLibavNativeAddon(): LibavModule {
  if (preloadedModule !== undefined) {
    return preloadedModule;
  }

  if (typeof require === 'function') {
    const libav = require('@scrypted/libav') as LibavModule;
    const addon = require('@scrypted/libav/build/Release/addon.node');
    libav.loadAddon(undefined, (() => addon) as unknown as NodeRequire);
    preloadedModule = libav;
    return libav;
  }

  const nodeRequire = createRequire(import.meta.url);
  const libav = nodeRequire('@scrypted/libav') as LibavModule;
  const addon = nodeRequire('@scrypted/libav/build/Release/addon.node');
  libav.loadAddon(undefined, (() => addon) as unknown as NodeRequire);
  preloadedModule = libav;
  return libav;
}

export function isScryptedLibavAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('@scrypted/libav');
    return true;
  } catch {
    return false;
  }
}

export function createScryptedLibavRuntime(options: { install?: boolean } = {}): LibavRuntime {
  return {
    get keyPacketFlag(): number {
      if (loadedModule === undefined) {
        throw new Error('The libav runtime must be initialized before use.');
      }
      return loadedModule.AVPacketFlags.AV_PKT_FLAG_KEY;
    },
    async initialize(): Promise<void> {
      initialization ??= (async () => {
        let libav: LibavModule;
        if (Boolean((process as PkgProcess).pkg)) {
          libav = preloadScryptedLibavNativeAddon();
        } else {
          try {
            libav = await import('@scrypted/libav');
          } catch (error) {
            throw new Error(
              'Required @scrypted/libav dependency is not installed or could not be loaded.',
              { cause: error },
            );
          }
        }

        // Managed decoder processes must never race native binary installation.
        // The package postinstall prepares assets; managed startup only loads them.
        if (options.install === false) libav.loadAddon();
        else await libav.install();
        libav.setAVLogLevel('error');
        loadedModule = libav;
      })();
      await initialization;
    },
    createFormatContext(): LibavFormatContextLike {
      if (loadedModule === undefined) {
        throw new Error('The libav runtime must be initialized before use.');
      }
      return loadedModule.createAVFormatContext() as unknown as LibavFormatContextLike;
    },
    async toJpeg(frame: LibavFrameLike, quality: number): Promise<Buffer> {
      if (loadedModule === undefined) {
        throw new Error('The libav runtime must be initialized before use.');
      }
      return Buffer.from(await loadedModule.toJpeg(
        frame as import('@scrypted/libav').AVFrame,
        quality,
      ));
    },
  };
}
