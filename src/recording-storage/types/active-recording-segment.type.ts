import type { FileHandle } from 'node:fs/promises';

import type { ClockAnchorMetadata } from './clock-anchor-metadata.type.js';
import type { PlaypointMetadata } from './playpoint-metadata.type.js';
import type { KeyframeMetadata } from './keyframe-metadata.type.js';
/**
 * Open segment file, byte count, and pending index data before publication.
 */
export type ActiveRecordingSegment = {
  /** Unix millisecond time at which the session began. */
  sessionStartMs: number;
  /** Published path of the recording session metadata file. */
  sessionMetadataPath: string;
  /** Start in milliseconds. */
  startMs: number;
  /** Hour start in milliseconds. */
  hourStartMs: number;
  /** Temporary media path before atomic publication. */
  partialMediaPath: string;
  /** Published path of the segment’s media bytes. */
  mediaPath: string;
  /** Published path of this segment’s metadata file. */
  metadataPath: string;
  /** Handle used to stop or release this resource. */
  handle: FileHandle;
  /** Whether this item follows a source or timing discontinuity. */
  discontinuityBefore: boolean;
  /** RTP-to-wall-clock reference points from RTCP or the recording index. */
  clockAnchors: ClockAnchorMetadata[];
  /** Stored seek points for playback. */
  playpoints: PlaypointMetadata[];
  /** Indexed keyframe positions for seeking. */
  keyframes: KeyframeMetadata[];
  /** Number of bytes in this payload or queued buffer. */
  bytes: number;
  /** End time in milliseconds. */
  endTimeMs: number;
};
