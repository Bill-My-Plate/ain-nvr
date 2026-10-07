


export interface FrameHandle {
  /** First JPEG passed to onFrame, distinct from decoder process startup. */
  readonly ready: Promise<void>;
  readonly completion: Promise<void>;
  stop(): Promise<void>;
}
