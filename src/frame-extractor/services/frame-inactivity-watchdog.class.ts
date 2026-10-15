import { AinNvrError } from '../../shared/index.js';
import type { LibavFormatContextLike } from '../types/libav-format-context-like.type.js';

/** Cancels a session and closes its context after a gap in decoded frames. */
export class FrameInactivityWatchdog {
  private timer: NodeJS.Timeout | undefined;
  private timedOut = false;

  /** Stores the session resources and inactivity threshold. */
  public constructor(
    private readonly context: LibavFormatContextLike,
    private readonly controller: AbortController,
    private readonly timeoutMs: number,
  ) {}

  /** Reports whether the watchdog caused the session to stop. */
  public get expired(): boolean {
    return this.timedOut;
  }

  /** Starts or resets the deadline after a decoded frame. */
  public arm(): void {
    this.clear();
    this.timer = setTimeout(() => {
      this.timedOut = true;
      this.controller.abort(
        new AinNvrError('media_timeout', `No decoded frame was received for ${this.timeoutMs} ms.`),
      );
      void this.context.close().catch(() => undefined);
    }, this.timeoutMs);
    this.timer.unref();
  }

  /** Removes the deadline when the session ends. */
  public clear(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
