import { AinNvrError } from '../../shared/index.js';

import type { LibavFormatContextLike } from '../types/libav-format-context-like.type.js';
import type { LibavStreamLike } from '../types/libav-stream-like.type.js';
/**
 * Finds the H.264 video stream in a libav format context.
 */
export function selectH264Stream(context: LibavFormatContextLike): LibavStreamLike {
  const stream = context.streams.find(
    (candidate) =>
      candidate.type.toLowerCase() === 'video' && candidate.codec.toLowerCase() === 'h264',
  );
  if (stream === undefined) {
    throw new AinNvrError('unsupported_codec', 'RTSP source has no H.264 video stream.');
  }
  return stream;
}
