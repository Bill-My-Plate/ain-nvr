
import type { CommittedSegment } from '../recording-storage/index.js';

export interface RecordingOptions {
  readonly cacheRoot: string;
  /** Used only to avoid session-ID collisions. Promotion remains application-owned. */
  readonly finalRoot?: string;
  readonly segmentDurationMs: number;
  readonly playpointIntervalMs?: number;
  readonly minimumFreeBytes?: number;
  readonly onCommitted: (segment: CommittedSegment) => Promise<void> | void;
  readonly onSessionClosed?: (cameraId: string, sessionStartMs: number) => Promise<void> | void;
  readonly onError: (error: Error) => void;
  readonly onProgress?: () => void;
}
