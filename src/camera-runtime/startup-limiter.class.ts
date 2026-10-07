


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
