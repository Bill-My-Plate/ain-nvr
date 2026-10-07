


import type { RecordingOptions } from './recording-options.interface.js';
import type { FrameOptions } from './frame-options.interface.js';
import type { RecordingHandle } from './recording-handle.interface.js';
import type { FrameHandle } from './frame-handle.interface.js';
import type { CameraStatus } from './camera-status.interface.js';

export interface CameraLease {
  readonly cameraId: string;
  readonly status: CameraStatus;
  subscribeStatus(listener: (status: CameraStatus) => void): () => void;
  startRecording(options: RecordingOptions): Promise<RecordingHandle>;
  startFrames(options: FrameOptions): Promise<FrameHandle>;
  release(): Promise<void>;
}
