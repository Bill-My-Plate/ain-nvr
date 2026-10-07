



import type { LibavFrameLike } from './libav-frame-like.type.js';

export type QueuedFrame = {
  readonly frame: LibavFrameLike;
  readonly captureTimeMs: number;
  readonly decoder: string;
};
