import type { PlaybackClock } from '../types/playback-clock.type.js';
import type { TimestampedPlaybackItem } from '../types/timestamped-playback-item.type.js';
import type { PlaybackPacerOptions } from '../types/playback-pacer-options.interface.js';
import { SYSTEM_CLOCK } from '../constants/system-clock.constant.js';

export class PlaybackPacer<T extends TimestampedPlaybackItem> {
  private readonly maxLookaheadUs: number;
  private readonly clock: PlaybackClock;
  private readonly waiters = new Set<() => void>();
  private paused = false;
  private pausedAtMs: number | undefined;
  private acknowledgedTimestampUs = 0;
  private originMs: number | undefined;

  constructor(options: PlaybackPacerOptions = {}) {
    this.maxLookaheadUs = options.maxLookaheadUs ?? 1_000_000;
    if (!Number.isSafeInteger(this.maxLookaheadUs) || this.maxLookaheadUs < 0) {
      throw new RangeError('maxLookaheadUs must be a non-negative safe integer.');
    }
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  pause(): void {
    if (this.paused) {
      return;
    }
    this.paused = true;
    this.pausedAtMs = this.clock.nowMs();
  }

  resume(): void {
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

  start(timestampUs: number): void {
    if (!Number.isSafeInteger(timestampUs) || timestampUs < 0) {
      throw new RangeError('timestampUs must be a non-negative safe integer.');
    }
    this.originMs ??= this.clock.nowMs() - timestampUs / 1000;
  }

  acknowledge(renderedTimestampUs: number): void {
    if (Number.isSafeInteger(renderedTimestampUs)
      && renderedTimestampUs >= this.acknowledgedTimestampUs) {
      this.acknowledgedTimestampUs = renderedTimestampUs;
      this.notify();
    }
  }

  async run(
    source: AsyncIterable<T>,
    send: (item: T) => Promise<void> | void,
    signal: AbortSignal,
  ): Promise<void> {
    for await (const item of source) {
      await this.schedule(item, send, signal);
    }
  }

  async schedule(
    item: T,
    send: (item: T) => Promise<void> | void,
    signal: AbortSignal,
  ): Promise<void> {
    await this.waitUntilAllowed(item.timestampUs, signal);
    this.start(item.timestampUs);
    const delayMs = this.originMs! + item.timestampUs / 1000 - this.clock.nowMs();
    if (delayMs > 0) {
      await this.clock.sleep(delayMs, signal);
    }
    if (signal.aborted) {
      throw signal.reason;
    }
    await send(item);
  }

  private async waitUntilAllowed(timestampUs: number, signal: AbortSignal): Promise<void> {
    while (this.paused
      || timestampUs > this.acknowledgedTimestampUs + this.maxLookaheadUs) {
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

  private notify(): void {
    for (const waiter of [...this.waiters]) {
      waiter();
    }
  }
}
