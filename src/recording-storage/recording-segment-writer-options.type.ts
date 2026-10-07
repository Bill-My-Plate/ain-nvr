
import type { RtspSessionInfo } from '../stream-session/index.js';

import type { CommittedSegment } from './committed-segment.type.js';

export type RecordingSegmentWriterOptions = {
  cacheRoot: string;
  finalRoot?: string;
  cameraId: string;
  sessionStartMs: number;
  sessionInfo: RtspSessionInfo;
  segmentDurationMs: number;
  playpointIntervalMs?: number;
  minimumFreeBytes?: number;
  onCommitted: (segment: CommittedSegment) => void;
  onSessionClosed: (cameraId: string, sessionStartMs: number) => void;
  onConfigurationChanged?: () => void;
};
