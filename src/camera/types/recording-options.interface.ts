import type { CommittedSegment } from '../../recording-storage/index.js';
/**
 * Configuration options for recording.
 */
export interface RecordingOptions {
  /** Directory where incomplete recording files are staged. */
  readonly cacheRoot: string;
  /** Used only to avoid session-ID collisions. Promotion remains application-owned. */
  readonly finalRoot?: string;
  /** Segment duration in milliseconds. */
  readonly segmentDurationMs: number;
  /** Playpoint interval in milliseconds. */
  readonly playpointIntervalMs?: number;
  /** Minimum free measured in bytes. */
  readonly minimumFreeBytes?: number;
  /** Callback invoked when committed occurs. */
  readonly onCommitted: (segment: CommittedSegment) => Promise<void> | void;
  /** Callback invoked when session closed occurs. */
  readonly onSessionClosed?: (cameraId: string, sessionStartMs: number) => Promise<void> | void;
  /** Callback invoked when the operation fails. */
  readonly onError: (error: Error) => void;
  /** Callback invoked when progress occurs. */
  readonly onProgress?: () => void;
}
