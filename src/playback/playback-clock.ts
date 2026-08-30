export interface PlaybackClock {
  nowMs(): number;
  sleep(milliseconds: number, signal: AbortSignal): Promise<void>;
}

export interface TimestampedPlaybackItem {
  readonly timestampUs: number;
}

export interface TrackTimestampedPlaybackItem extends TimestampedPlaybackItem {
  readonly kind: 'video' | 'audio';
}

export interface PlaybackPacerOptions {
  readonly maxLookaheadUs?: number;
  readonly clock?: PlaybackClock;
}

function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, Math.max(0, milliseconds));
    timeout.unref();
    signal.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(signal.reason);
    }, { once: true });
  });
}

const SYSTEM_CLOCK: PlaybackClock = {
  nowMs: () => performance.now(),
  sleep: defaultSleep,
};

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

/**
 * Mirrors Scrypted's separate video and audio RTP schedulers. Video provides
 * read-side pacing, while audio runs on its own serial lane and cannot block
 * an earlier video timestamp. Both lanes share the pacer's wall-clock origin.
 */
export async function runIndependentPlaybackTracks<T extends TrackTimestampedPlaybackItem>(
  pacer: PlaybackPacer<T>,
  source: AsyncIterable<T>,
  send: (item: T) => Promise<void> | void,
  signal: AbortSignal,
  maximumPendingAudioItems = 512,
): Promise<void> {
  if (!Number.isSafeInteger(maximumPendingAudioItems) || maximumPendingAudioItems <= 0) {
    throw new RangeError('maximumPendingAudioItems must be a positive safe integer.');
  }

  // Playback access units are relative to the selected decoder-safe keyframe.
  pacer.start(0);
  const laneAbort = new AbortController();
  const laneSignal = AbortSignal.any([signal, laneAbort.signal]);
  let videoTail = Promise.resolve();
  let audioTail = Promise.resolve();
  const pendingAudio: Promise<void>[] = [];

  try {
    for await (const item of source) {
      if (laneSignal.aborted) {
        throw laneSignal.reason;
      }
      if (item.kind === 'video') {
        // Match Scrypted's awaited video scheduler queue: at most one video
        // access unit is being paced while the recording reader moves ahead.
        await videoTail;
        videoTail = pacer.schedule(item, send, laneSignal);
        void videoTail.catch(() => {});
        continue;
      }

      const scheduled = audioTail.then(() => pacer.schedule(item, send, laneSignal));
      audioTail = scheduled;
      void scheduled.catch(() => {});
      pendingAudio.push(scheduled);
      if (pendingAudio.length >= maximumPendingAudioItems) {
        await pendingAudio.shift();
      }
    }
    await Promise.all([videoTail, audioTail]);
  } catch (error) {
    laneAbort.abort(error);
    await Promise.allSettled([videoTail, audioTail]);
    throw error;
  }
}
