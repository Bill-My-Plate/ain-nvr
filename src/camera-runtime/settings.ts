import type { CameraRuntimeOptions } from './types.js';
import type { RuntimeSettings } from './protocol.js';

const defaults: RuntimeSettings = {
  maxCameras: 32, maxStartingCameras: 4, maxLeasesPerCamera: 128, maxFrameSubscribers: 16,
  acquireTimeoutMs: 20_000, operationTimeoutMs: 30_000, shutdownTimeoutMs: 10_000,
  firstFrameTimeoutMs: 30_000, callbackTimeoutMs: 10_000,
  maximumFrameBytes: 8 * 1024 * 1024, maximumFrameAgeMs: 2_000,
  maximumPendingEvents: 128, maxWorkerRestarts: 1, restartDelayMs: 500,
};
export function resolveSettings(options: CameraRuntimeOptions): RuntimeSettings {
  const settings = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof RuntimeSettings)[]) {
    const value = options[key] ?? defaults[key];
    if (!Number.isSafeInteger(value) || value < (key === 'maxWorkerRestarts' ? 0 : 1)) {
      throw new RangeError(`${key} must be a ${key === 'maxWorkerRestarts' ? 'nonnegative' : 'positive'} safe integer.`);
    }
    settings[key] = value;
  }
  return settings;
}

export class StartupLimiter {
  private running = 0;
  private readonly waiting: (() => void)[] = [];
  constructor(private readonly maximum: number) {}
  async run<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    if (this.running >= this.maximum) {
      await new Promise<void>((resolve, reject) => {
        const proceed = (): void => { signal.removeEventListener('abort', cancel); resolve(); };
        const cancel = (): void => {
          const index = this.waiting.indexOf(proceed);
          if (index >= 0) this.waiting.splice(index, 1);
          signal.removeEventListener('abort', cancel);
          reject(signal.reason);
        };
        this.waiting.push(proceed);
        signal.addEventListener('abort', cancel, { once: true });
      });
    } else this.running++;
    try { signal.throwIfAborted(); return await action(); }
    finally {
      const next = this.waiting.shift();
      if (next === undefined) this.running--;
      else next(); // Transfer the occupied slot, without an await/acquire race.
    }
  }
}
