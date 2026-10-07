


import type { LibavDecoderLike } from './libav-decoder-like.type.js';
import type { LibavFrameLike } from './libav-frame-like.type.js';

import type { DecoderCandidate } from './decoder-candidate.interface.js';

export interface DecoderSelection {
  readonly decoder: LibavDecoderLike;
  readonly firstFrame: LibavFrameLike;
  readonly candidate: DecoderCandidate;
}
