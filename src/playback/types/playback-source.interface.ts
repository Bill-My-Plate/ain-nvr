





import type { PlaybackSegment } from './playback-segment.type.js';
import type { PlaybackStart } from './playback-start.interface.js';

export interface PlaybackSource<TSegmentRef> {
  resolveStart(
    cameraId: string,
    requestedTimeMs: number,
    signal?: AbortSignal,
  ): Promise<PlaybackStart<TSegmentRef>>;
  nextSegment(
    segment: TSegmentRef,
    signal?: AbortSignal,
  ): Promise<PlaybackSegment<TSegmentRef> | undefined>;
}
