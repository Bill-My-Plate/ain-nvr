/**
 * Handle for stopping a JPEG frame subscription.
 */
export interface FrameHandle {
  /** First JPEG passed to onFrame, distinct from decoder process startup. */
  readonly ready: Promise<void>;
  /** Promise settled when this operation has finished. */
  readonly completion: Promise<void>;
  /**
   * Stops this consumer and settles its completion promise.
   */
  stop(): Promise<void>;
}
