import { createRequire } from 'node:module';

import type {
  LibavFormatContextLike,
  LibavFrameLike,
  LibavRuntime,
} from './libav-types.js';

type LibavModule = typeof import('@scrypted/libav');

let loadedModule: LibavModule | undefined;
let initialization: Promise<void> | undefined;

export function isScryptedLibavAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('@scrypted/libav');
    return true;
  } catch {
    return false;
  }
}

export function createScryptedLibavRuntime(): LibavRuntime {
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
        try {
          libav = await import('@scrypted/libav');
        } catch (error) {
          throw new Error(
            'Required @scrypted/libav dependency is not installed or could not be loaded.',
            { cause: error },
          );
        }
        await libav.install();
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
