import type { CommittedSegment } from '../../recording-storage/index.js';

import { type RecordingConfiguration } from './recording-configuration.type.js';
/**
 * Configuration options for recorder.
 */
export type RecorderOptions = RecordingConfiguration & {
  /**
   * Stable identifier of the camera associated with this value.
   */
  cameraId: string;
  /**
   * Callback invoked for Committed.
   */
  onCommitted(segment: CommittedSegment): void;
  /**
   * Callback invoked for Session Closed.
   */
  onSessionClosed(cameraId: string, sessionStartMs: number): void;
  /**
   * Callback invoked for Error.
   */
  onError(error: Error): void;
  /**
   * Callback invoked for Progress.
   */
  onProgress(): void;
};
