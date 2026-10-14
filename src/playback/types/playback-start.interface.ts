import type { PlaybackSegment } from './playback-segment.type.js';
/**
 * Resolved segment and byte offset for a requested start time.
 */
export interface PlaybackStart<TSegmentRef> {
  /** Recording segment being written or played. */
  readonly segment: PlaybackSegment<TSegmentRef>;
  /** Byte offset from the start of the stored media file. */
  readonly byteOffset: number;
  /** Actual start time in milliseconds. */
  readonly actualStartTimeMs: number;
}
