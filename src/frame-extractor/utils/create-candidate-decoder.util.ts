


import type { LibavDecoderLike } from '../types/libav-decoder-like.type.js';
import type { LibavFormatContextLike } from '../types/libav-format-context-like.type.js';

import type { DecoderCandidate } from '../types/decoder-candidate.interface.js';

export function createCandidateDecoder(
  context: LibavFormatContextLike,
  streamIndex: number,
  candidate: DecoderCandidate,
): LibavDecoderLike {
  if (candidate.hardwareDevice === undefined) {
    return context.createDecoder(streamIndex);
  }
  if (candidate.deviceName !== undefined) {
    return context.createDecoder(
      streamIndex,
      candidate.hardwareDevice,
      candidate.decoder,
      candidate.deviceName,
    );
  }
  if (candidate.decoder !== undefined) {
    return context.createDecoder(
      streamIndex,
      candidate.hardwareDevice,
      candidate.decoder,
    );
  }
  return context.createDecoder(streamIndex, candidate.hardwareDevice);
}
