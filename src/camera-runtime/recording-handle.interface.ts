


export interface RecordingHandle {
  readonly completion: Promise<void>;
  requestBoundary(): Promise<void>;
  /** Drains media and publishes files; application notification callbacks are asynchronous. */
  stop(): Promise<void>;
}
