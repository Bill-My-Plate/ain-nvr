


import type { ClockAnchorMetadata } from './clock-anchor-metadata.type.js';
import type { PlaypointMetadata } from './playpoint-metadata.type.js';
import type { KeyframeMetadata } from './keyframe-metadata.type.js';

export type SegmentMetadata = {
  schemaVersion: 1;
  cameraId: string;
  sessionStartMs: number;
  segmentStartMs: number;
  endTimeMs: number;
  durationMs: number;
  complete: true;
  bytes: number;
  discontinuityBefore: boolean;
  clockAnchors: ClockAnchorMetadata[];
  playpointIntervalMs: number;
  playpoints: PlaypointMetadata[];
  keyframes: KeyframeMetadata[];
};
