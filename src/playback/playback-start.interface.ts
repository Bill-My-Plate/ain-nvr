





import type { PlaybackSegment } from './playback-segment.type.js';

export interface PlaybackStart<TSegmentRef> {
  readonly segment: PlaybackSegment<TSegmentRef>;
  readonly byteOffset: number;
  readonly actualStartTimeMs: number;
}
