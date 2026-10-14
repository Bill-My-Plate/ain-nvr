import type { LibavDecoderLike } from './libav-decoder-like.type.js';
import type { LibavFrameLike } from './libav-frame-like.type.js';

import type { DecoderCandidate } from './decoder-candidate.interface.js';
/**
 * Decoder chosen from candidates and any fallback information.
 */
export interface DecoderSelection {
  /** Decoder selection or current decoder state. */
  readonly decoder: LibavDecoderLike;
  /** First decoded frame used to validate the decoder choice. */
  readonly firstFrame: LibavFrameLike;
  /** Decoder candidate that passed selection checks. */
  readonly candidate: DecoderCandidate;
}
