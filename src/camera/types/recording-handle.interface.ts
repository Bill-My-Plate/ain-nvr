/**
 * Handle for requesting a segment boundary or stopping recording.
 */
export interface RecordingHandle {
  /** Promise settled when this operation has finished. */
  readonly completion: Promise<void>;
  /**
   * Requests a new recording segment at the next safe boundary.
   */
  requestBoundary(): Promise<void>;
  /** Drains media and publishes files; application notification callbacks are asynchronous. */
  stop(): Promise<void>;
}
