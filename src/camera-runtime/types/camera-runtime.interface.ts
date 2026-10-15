import type { CameraLease } from '../../camera/index.js';
/**
 * Contract for acquiring camera leases and shutting down the registry.
 */
export interface CameraRuntime {
  /**
   * Acquires a lease for the requested camera and RTSP URL.
   */
  acquire(input: {
    /** Camera identifier for this request or worker. */
    cameraId: string;
    /** RTSP URL used by this operation. */
    url: string;
    /** Abort signal used to cancel the operation. */
    signal?: AbortSignal;
  }): Promise<CameraLease>;
  /**
   * Closes this resource and releases owned handles.
   */
  close(): Promise<void>;
}
