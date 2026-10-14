import type { PlaybackSegment } from './playback-segment.type.js';
import type { PlaybackStart } from './playback-start.interface.js';
/**
 * Contract for finding and reading recording segments for playback.
 */
export interface PlaybackSource<TSegmentRef> {
  /**
   * Finds the segment and byte offset nearest the requested playback time.
   */
  resolveStart(
    cameraId: string,
    requestedTimeMs: number,
    signal?: AbortSignal,
  ): Promise<PlaybackStart<TSegmentRef>>;
  /**
   * Returns the next continuous recording segment, if one exists.
   */
  nextSegment(
    segment: TSegmentRef,
    signal?: AbortSignal,
  ): Promise<PlaybackSegment<TSegmentRef> | undefined>;
}
