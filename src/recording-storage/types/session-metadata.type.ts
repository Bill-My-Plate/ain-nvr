import type { SessionTrack } from './session-track.type.js';
/**
 * Recording session start, tracks, codec configuration, and segment list.
 */
export type SessionMetadata = {
  /** On-disk metadata schema version used by readers. */
  schemaVersion: 1;
  /**
   * Stable identifier of the camera associated with this value.
   */
  cameraId: string;
  /** Unix millisecond time at which the session began. */
  sessionStartMs: number;
  /** Unix millisecond time when this metadata was created. */
  createdAt: string;
  /** Segment duration in milliseconds. */
  segmentDurationMs: number;
  /** Playpoint interval in milliseconds. */
  playpointIntervalMs: number;
  /** Session Description Protocol text returned by RTSP DESCRIBE. */
  sdp: string;
  /** Track descriptions participating in this session. */
  tracks: SessionTrack[];
};
