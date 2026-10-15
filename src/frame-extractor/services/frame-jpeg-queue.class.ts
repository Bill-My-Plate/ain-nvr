import type { FrameJpegQueueOptions } from '../types/frame-jpeg-queue-options.type.js';
import type { QueuedFrame } from '../types/queued-frame.type.js';

/** Encodes one frame while retaining at most one waiting native frame. */
export class FrameJpegQueue {
  private pending: QueuedFrame | undefined;
  private activeEncode: Promise<void> | undefined;
  private processingFailure: Error | undefined;

  /** Stores the delivery dependencies for this decoding session. */
  public constructor(private readonly options: FrameJpegQueueOptions) {}

  /** Returns the first JPEG encoder or callback error, if one occurred. */
  public get failure(): Error | undefined {
    return this.processingFailure;
  }

  /** Accepts a frame or destroys it when the one-slot waiting queue is full. */
  public offer(item: QueuedFrame): void {
    if (this.activeEncode === undefined) {
      this.startEncode(item);
    } else if (this.pending === undefined) {
      this.pending = item;
    } else {
      item.frame.destroy();
      this.options.onDropped();
    }
  }

  /** Destroys the waiting frame and waits for the active callback to settle. */
  public async close(): Promise<void> {
    this.pending?.frame.destroy();
    this.pending = undefined;
    await this.activeEncode?.catch(() => undefined);
  }

  /** Runs JPEG conversion and delivery, then advances the waiting frame. */
  private startEncode(item: QueuedFrame): void {
    this.activeEncode = (async () => {
      const { width, height } = item.frame;
      let jpeg: Buffer;
      try {
        jpeg = await this.options.runtime.toJpeg(item.frame, this.options.jpegQuality);
      } finally {
        // The callback receives independent JPEG bytes; it need not retain the native frame.
        item.frame.destroy();
      }
      const frameNumber = this.options.nextFrameNumber();
      await this.options.onFrame({
        data: jpeg,
        frameNumber,
        captureTimeMs: item.captureTimeMs,
        width,
        height,
        decoder: item.decoder,
      });
      this.options.onEmitted();
    })()
      .catch((error: unknown) => {
        this.processingFailure = error instanceof Error ? error : new Error(String(error));
      })
      .finally(() => {
        this.activeEncode = undefined;
        if (this.pending !== undefined) {
          const next = this.pending;
          this.pending = undefined;
          if (this.processingFailure === undefined) this.startEncode(next);
          else next.frame.destroy();
        }
      });
  }
}
