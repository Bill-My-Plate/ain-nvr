import type { ClockAnchorMetadata } from './clock-anchor-metadata.type.js';
import type { PlaypointMetadata } from './playpoint-metadata.type.js';
import type { KeyframeMetadata } from './keyframe-metadata.type.js';
/**
 * Stored segment index, timing, tracks, and published file references.
 */
export type SegmentMetadata = {
  /** On-disk metadata schema version used by readers. */
  schemaVersion: 1;
  /**
   * Stable identifier of the camera associated with this value.
   */
  cameraId: string;
  /** Unix millisecond time at which the session began. */
  sessionStartMs: number;
  /** Segment start in milliseconds. */
  segmentStartMs: number;
  /** End time in milliseconds. */
  endTimeMs: number;
  /** Duration in milliseconds. */
  durationMs: number;
  /** True once all segment bytes and metadata have been committed. */
  complete: true;
  /** Number of bytes in this payload or queued buffer. */
  bytes: number;
  /** Whether this item follows a source or timing discontinuity. */
  discontinuityBefore: boolean;
  /** RTP-to-wall-clock reference points from RTCP or the recording index. */
  clockAnchors: ClockAnchorMetadata[];
  /** Playpoint interval in milliseconds. */
  playpointIntervalMs: number;
  /** Stored seek points for playback. */
  playpoints: PlaypointMetadata[];
  /** Indexed keyframe positions for seeking. */
  keyframes: KeyframeMetadata[];
};
