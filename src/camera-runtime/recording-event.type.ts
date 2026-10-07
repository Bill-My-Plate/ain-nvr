
import type { CommittedSegment } from '../recording-storage/index.js';

export type RecordingEvent =
  | { type: 'committed'; segment: CommittedSegment }
  | { type: 'session-closed'; cameraId: string; sessionStartMs: number };
