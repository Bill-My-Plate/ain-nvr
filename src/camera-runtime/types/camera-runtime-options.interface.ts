/** Limits apply to this context's shared managed registry. */
export interface CameraRuntimeOptions {
  /** Upper bound for cameras. */
  readonly maxCameras?: number;
  /** Upper bound for starting cameras. */
  readonly maxStartingCameras?: number;
  /** Upper bound for leases per camera. */
  readonly maxLeasesPerCamera?: number;
  /** Upper bound for frame subscribers. */
  readonly maxFrameSubscribers?: number;
  /** Acquire timeout in milliseconds. */
  readonly acquireTimeoutMs?: number;
  /** Operation timeout in milliseconds. */
  readonly operationTimeoutMs?: number;
  /** Shutdown timeout in milliseconds. */
  readonly shutdownTimeoutMs?: number;
  /** First frame timeout in milliseconds. */
  readonly firstFrameTimeoutMs?: number;
  /** Callback timeout in milliseconds. */
  readonly callbackTimeoutMs?: number;
  /** Maximum frame measured in bytes. */
  readonly maximumFrameBytes?: number;
  /** Maximum frame age in milliseconds. */
  readonly maximumFrameAgeMs?: number;
  /** Upper bound for pending events. */
  readonly maximumPendingEvents?: number;
  /** Replacements per camera lifetime; network reconnects do not consume this budget. */
  readonly maxWorkerRestarts?: number;
  /** Restart delay in milliseconds. */
  readonly restartDelayMs?: number;
}
