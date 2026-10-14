import { PLAYBACK_CONSTANTS } from '../constants/playback-numeric-values.constant.js';
import type { PlaybackClock } from '../types/playback-clock.type.js';
import type { TimestampedPlaybackItem } from '../types/timestamped-playback-item.type.js';
import type { PlaybackPacerOptions } from '../types/playback-pacer-options.interface.js';
import { SYSTEM_CLOCK } from '../constants/system-clock.constant.js';
/**
 * Schedules playback messages by timestamp and downstream acknowledgement.
 */
export class PlaybackPacer<T extends TimestampedPlaybackItem> {
  private readonly maxLookaheadUs: number;
  private readonly clock: PlaybackClock;
  private readonly waiters = new Set<() => void>();
  private paused = false;
  private pausedAtMs: number | undefined;
  private acknowledgedTimestampUs = 0;
  private originMs: number | undefined;
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(options: PlaybackPacerOptions = {}) {
    this.maxLookaheadUs = options.maxLookaheadUs ?? PLAYBACK_CONSTANTS.defaultMaximumLookaheadUs;
    if (!Number.isSafeInteger(this.maxLookaheadUs) || this.maxLookaheadUs < 0) {
      throw new RangeError('maxLookaheadUs must be a non-negative safe integer.');
    }
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  /**
   * Pause.
   */
  public pause(): void {
    if (this.paused) {
      return;
    }
    this.paused = true;
    this.pausedAtMs = this.clock.nowMs();
  }

  /**
   * Resume.
   */
  public resume(): void {
    if (!this.paused) {
      return;
    }
    const nowMs = this.clock.nowMs();
    if (this.originMs !== undefined && this.pausedAtMs !== undefined) {
      this.originMs += nowMs - this.pausedAtMs;
    }
    this.paused = false;
    this.pausedAtMs = undefined;
    this.notify();
  }

  /**
   * Starts the operation and initializes its resources.
   */
  public start(timestampUs: number): void {
    if (!Number.isSafeInteger(timestampUs) || timestampUs < 0) {
      throw new RangeError('timestampUs must be a non-negative safe integer.');
    }
    this.originMs ??=
      this.clock.nowMs() - timestampUs / PLAYBACK_CONSTANTS.microsecondsPerMillisecond;
  }

  /**
   * Acknowledge.
   */
  public acknowledge(renderedTimestampUs: number): void {
    if (
      Number.isSafeInteger(renderedTimestampUs) &&
      renderedTimestampUs >= this.acknowledgedTimestampUs
    ) {
      this.acknowledgedTimestampUs = renderedTimestampUs;
      this.notify();
    }
  }

  /**
   * Runs the operation until completion or cancellation.
   */
  public async run(
    source: AsyncIterable<T>,
    send: (item: T) => Promise<void> | void,
    signal: AbortSignal,
  ): Promise<void> {
    for await (const item of source) {
      await this.schedule(item, send, signal);
    }
  }

  /**
   * Schedule.
   */
  public async schedule(
    item: T,
    send: (item: T) => Promise<void> | void,
    signal: AbortSignal,
  ): Promise<void> {
    await this.waitUntilAllowed(item.timestampUs, signal);
    this.start(item.timestampUs);
    const delayMs =
      this.originMs! +
      item.timestampUs / PLAYBACK_CONSTANTS.microsecondsPerMillisecond -
      this.clock.nowMs();
    if (delayMs > 0) {
      await this.clock.sleep(delayMs, signal);
    }
    if (signal.aborted) {
      throw signal.reason;
    }
    await send(item);
  }

  /**
   * Wait Until Allowed.
   */
  private async waitUntilAllowed(timestampUs: number, signal: AbortSignal): Promise<void> {
    while (this.paused || timestampUs > this.acknowledgedTimestampUs + this.maxLookaheadUs) {
      if (signal.aborted) {
        throw signal.reason;
      }
      await new Promise<void>((resolve, reject) => {
        const wake = (): void => {
          signal.removeEventListener('abort', abort);
          this.waiters.delete(wake);
          resolve();
        };
        const abort = (): void => {
          this.waiters.delete(wake);
          reject(signal.reason);
        };
        this.waiters.add(wake);
        signal.addEventListener('abort', abort, { once: true });
      });
    }
  }

  /**
   * Notify.
   */
  private notify(): void {
    for (const waiter of [...this.waiters]) {
      waiter();
    }
  }
}
