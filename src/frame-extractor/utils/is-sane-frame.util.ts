


import type { LibavFrameLike } from '../types/libav-frame-like.type.js';

export function isSaneFrame(frame: LibavFrameLike): boolean {
  return Number.isInteger(frame.width)
    && Number.isInteger(frame.height)
    && frame.width > 0
    && frame.height > 0
    && frame.width <= 8_192
    && frame.height <= 8_192;
}
