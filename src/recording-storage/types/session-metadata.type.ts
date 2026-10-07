


import type { SessionTrack } from './session-track.type.js';

export type SessionMetadata = {
  schemaVersion: 1;
  cameraId: string;
  sessionStartMs: number;
  createdAt: string;
  segmentDurationMs: number;
  playpointIntervalMs: number;
  sdp: string;
  tracks: SessionTrack[];
};
