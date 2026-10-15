import type { RecordingOptions } from './recording-options.interface.js';
import type { FrameOptions } from './frame-options.interface.js';
import type { RecordingHandle } from './recording-handle.interface.js';
import type { FrameHandle } from './frame-handle.interface.js';
import type { CameraStatus } from './camera-status.interface.js';
/**
 * Per-caller operations and status view for one shared camera owner.
 */
export interface CameraLease {
  /**
   * Stable identifier of the camera associated with this value.
   */
  readonly cameraId: string;
  /** Current camera status exposed through the lease. */
  readonly status: CameraStatus;
  /**
   * Callback invoked for subscribe Status.
   */
  subscribeStatus(listener: (status: CameraStatus) => void): () => void;
  /**
   * Starts a recording consumer on this camera lease.
   */
  startRecording(options: RecordingOptions): Promise<RecordingHandle>;
  /**
   * Starts a JPEG frame consumer on this camera lease.
   */
  startFrames(options: FrameOptions): Promise<FrameHandle>;
  /**
   * Releases this caller’s reference to the shared camera.
   */
  release(): Promise<void>;
}
