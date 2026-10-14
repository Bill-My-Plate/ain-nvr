import type { LibavFrameLike } from './libav-frame-like.type.js';
/**
 * Decoded frame waiting for JPEG encoding and callback delivery.
 */
export type QueuedFrame = {
  /** Decoded or encoded frame delivered by this operation. */
  readonly frame: LibavFrameLike;
  /** Unix millisecond time at which the frame was captured. */
  readonly captureTimeMs: number;
  /** Decoder selection or current decoder state. */
  readonly decoder: string;
};
