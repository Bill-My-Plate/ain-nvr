/**
 * Current status of camera.
 */
export interface CameraStatus {
  /**
   * Stable identifier of the camera associated with this value.
   */
  readonly cameraId: string;
  /** Current lifecycle state of this component. */
  readonly state:
    | 'starting'
    | 'streaming'
    | 'reconnecting'
    | 'restarting'
    | 'closing'
    | 'closed'
    | 'failed';
  /** Worker lifetime number used to reject stale messages. */
  readonly workerEpoch: number;
  /** Counter advanced whenever the RTSP media session changes. */
  readonly streamGeneration: number;
  /** Whether this camera currently has an active recording consumer. */
  readonly recording: boolean;
  /** Decoder selection or current decoder state. */
  readonly decoder: 'idle' | 'starting' | 'ready' | 'failed';
  /** Most recent failure retained for status reporting. */
  readonly lastError?: Error;
}
