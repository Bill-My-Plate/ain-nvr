import type { RtspSessionInfo } from '../../stream-session/index.js';

import type { CommittedSegment } from './committed-segment.type.js';
/**
 * Configuration options for recording Segment Writer.
 */
export type RecordingSegmentWriterOptions = {
  /** Directory where incomplete recording files are staged. */
  cacheRoot: string;
  /** Directory where committed recording files are published. */
  finalRoot?: string;
  /**
   * Stable identifier of the camera associated with this value.
   */
  cameraId: string;
  /** Unix millisecond time at which the session began. */
  sessionStartMs: number;
  /** Negotiated RTSP session and track information written with the recording. */
  sessionInfo: RtspSessionInfo;
  /** Segment duration in milliseconds. */
  segmentDurationMs: number;
  /** Playpoint interval in milliseconds. */
  playpointIntervalMs?: number;
  /** Minimum free measured in bytes. */
  minimumFreeBytes?: number;
  /** Callback invoked when committed occurs. */
  onCommitted: (segment: CommittedSegment) => void;
  /** Callback invoked when session closed occurs. */
  onSessionClosed: (cameraId: string, sessionStartMs: number) => void;
  /** Callback invoked when configuration changed occurs. */
  onConfigurationChanged?: () => void;
};
