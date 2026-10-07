


export interface CameraStatus {
  readonly cameraId: string;
  readonly state: 'starting' | 'streaming' | 'reconnecting' | 'restarting' | 'closing' | 'closed' | 'failed';
  readonly workerEpoch: number;
  readonly streamGeneration: number;
  readonly recording: boolean;
  readonly decoder: 'idle' | 'starting' | 'ready' | 'failed';
  readonly framesDelivered: number;
  readonly framesDropped: number;
  readonly recordingQueuedBytes: number;
  readonly workerEventLoopDelayMs: number;
  /** Scan committed cache artifacts after writer ownership has been released. Sticky. */
  readonly reconciliationNeeded: boolean;
  readonly lastError?: Error;
}
