


/** Limits apply to this context's shared managed registry. */
export interface CameraRuntimeOptions {
  readonly maxCameras?: number;
  readonly maxStartingCameras?: number;
  readonly maxLeasesPerCamera?: number;
  readonly maxFrameSubscribers?: number;
  readonly acquireTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly shutdownTimeoutMs?: number;
  readonly firstFrameTimeoutMs?: number;
  readonly callbackTimeoutMs?: number;
  readonly maximumFrameBytes?: number;
  readonly maximumFrameAgeMs?: number;
  readonly maximumPendingEvents?: number;
  /** Replacements per camera lifetime; network reconnects do not consume this budget. */
  readonly maxWorkerRestarts?: number;
  readonly restartDelayMs?: number;
}
