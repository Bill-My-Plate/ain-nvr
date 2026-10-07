

import type { CommittedSegment } from '../../recording-storage/index.js';


import { type RecordingConfiguration } from './recording-configuration.type.js';

export type RecorderOptions = RecordingConfiguration & {
  cameraId: string;
  onCommitted(segment: CommittedSegment): void;
  onSessionClosed(cameraId: string, sessionStartMs: number): void;
  onError(error: Error): void;
  onProgress(): void;
};
