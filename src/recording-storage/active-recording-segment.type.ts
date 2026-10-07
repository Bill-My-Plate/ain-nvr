import type { FileHandle } from 'node:fs/promises';


import type { ClockAnchorMetadata } from './clock-anchor-metadata.type.js';
import type { PlaypointMetadata } from './playpoint-metadata.type.js';
import type { KeyframeMetadata } from './keyframe-metadata.type.js';

export type ActiveRecordingSegment = {
  sessionStartMs: number;
  sessionMetadataPath: string;
  startMs: number;
  hourStartMs: number;
  partialMediaPath: string;
  mediaPath: string;
  metadataPath: string;
  handle: FileHandle;
  discontinuityBefore: boolean;
  clockAnchors: ClockAnchorMetadata[];
  playpoints: PlaypointMetadata[];
  keyframes: KeyframeMetadata[];
  bytes: number;
  endTimeMs: number;
};
