/**
 * Clock and cancellable sleep operations used by the playback pacer.
 */
export type PlaybackClock = {
  /**
   * Now in milliseconds.
   */
  nowMs(): number;
  /**
   * Waits for a playback scheduling delay, respecting cancellation.
   */
  sleep(milliseconds: number, signal: AbortSignal): Promise<void>;
};
