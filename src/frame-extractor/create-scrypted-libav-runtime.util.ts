
import type { LibavFormatContextLike } from './libav-format-context-like.type.js';
import type { LibavFrameLike } from './libav-frame-like.type.js';
import type { LibavRuntime } from './libav-runtime.type.js';

import type { LibavModule } from './libav-module.type.js';
import type { PkgProcess } from './pkg-process.type.js';
import { loadedModule } from './loaded-module.constant.js';
import { initialization } from './initialization.constant.js';
import { preloadScryptedLibavNativeAddon } from './preload-scrypted-libav-native-addon.util.js';

export function createScryptedLibavRuntime(options: { install?: boolean } = {}): LibavRuntime {
  return {
    get keyPacketFlag(): number {
      if (loadedModule.value === undefined) {
        throw new Error('The libav runtime must be initialized before use.');
      }
      return loadedModule.value.AVPacketFlags.AV_PKT_FLAG_KEY;
    },
    async initialize(): Promise<void> {
      initialization.value ??= (async () => {
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
        loadedModule.value = libav;
      })();
      await initialization.value;
    },
    createFormatContext(): LibavFormatContextLike {
      if (loadedModule.value === undefined) {
        throw new Error('The libav runtime must be initialized before use.');
      }
      return loadedModule.value.createAVFormatContext() as unknown as LibavFormatContextLike;
    },
    async toJpeg(frame: LibavFrameLike, quality: number): Promise<Buffer> {
      if (loadedModule.value === undefined) {
        throw new Error('The libav runtime must be initialized before use.');
      }
      return Buffer.from(await loadedModule.value.toJpeg(
        frame as import('@scrypted/libav').AVFrame,
        quality,
      ));
    },
  };
}
