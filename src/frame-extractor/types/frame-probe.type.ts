import type { LibavFrameLike } from './libav-frame-like.type.js';

/**
 * Verifies that a decoded frame can be encoded into the JPEG format delivered by the extractor.
 */
export type FrameProbe = (frame: LibavFrameLike) => Promise<void>;
