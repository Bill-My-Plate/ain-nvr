import { FRAME_EXTRACTOR_CONSTANTS } from '../constants/frame-extractor-numeric-values.constant.js';
import type { LibavFrameLike } from '../types/libav-frame-like.type.js';
/**
 * Rejects decoded frames with invalid dimensions or data before JPEG encoding.
 */
export function isSaneFrame(frame: LibavFrameLike): boolean {
  return (
    Number.isInteger(frame.width) &&
    Number.isInteger(frame.height) &&
    frame.width > 0 &&
    frame.height > 0 &&
    frame.width <= FRAME_EXTRACTOR_CONSTANTS.maximumFrameDimensionPixels &&
    frame.height <= FRAME_EXTRACTOR_CONSTANTS.maximumFrameDimensionPixels
  );
}
