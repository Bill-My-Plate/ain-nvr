import type { RtspClient, RtspClientSession } from '../../rtsp-client/index.js';
import type { RtspInterleavedFrame } from '../../rtsp-parser/index.js';
import { MAX_STARTUP_BUFFER_BYTES } from '../constants/max-startup-buffer-bytes.constant.js';
import { MAX_STARTUP_FRAMES } from '../constants/max-startup-frames.constant.js';

/** Owns one RTSP client's listeners, early-media queue, and connection cleanup. */
export class RtspConnectionAttempt {
  private readonly queuedFrames: RtspInterleavedFrame[] = [];
  private queuedBytes = 0;
  private startupOverflow = false;
  private overflowClose: Promise<void> | undefined;
  private sessionReady = false;
  private disconnect: ((error: Error) => void) | undefined;
  private readonly disconnected: Promise<Error>;

  /** Attaches the listeners needed from the start of RTSP negotiation. */
  public constructor(
    public readonly client: RtspClient,
    private readonly stopSignal: AbortSignal,
    private readonly publishFrame: (frame: RtspInterleavedFrame) => void,
  ) {
    this.disconnected = new Promise<Error>((resolve) => {
      this.disconnect = resolve;
    });
    // RtspClient suppresses disconnect during explicit close; stopping must also wake the loop.
    this.stopSignal.addEventListener('abort', this.onStopped, { once: true });
    this.client.on('interleaved', this.onFrame);
    this.client.once('disconnect', this.onDisconnected);
  }

  /** Negotiates the session and rejects if early media exceeded its bounded queue. */
  public async connect(): Promise<RtspClientSession> {
    const session = await this.client.connect();
    if (this.startupOverflow) throw new Error('RTSP negotiation media buffer exceeded its limit.');
    return session;
  }

  /** Publishes queued media after the owner has installed the new track generation. */
  public activate(): void {
    this.sessionReady = true;
    for (const frame of this.queuedFrames) this.publishFrame(frame);
    this.queuedFrames.length = 0;
  }

  /** Resolves when this client disconnects or the owning session stops. */
  public waitForDisconnect(): Promise<Error> {
    return this.disconnected;
  }

  /** Removes listeners, finishes an overflow close, and closes the client. */
  public async close(): Promise<void> {
    this.stopSignal.removeEventListener('abort', this.onStopped);
    this.client.removeListener('interleaved', this.onFrame);
    this.client.removeListener('disconnect', this.onDisconnected);
    await this.overflowClose;
    await this.client.close().catch(() => undefined);
  }

  /** Buffers complete interleaved frames until channel negotiation has finished. */
  private readonly onFrame = (frame: RtspInterleavedFrame): void => {
    if (!this.sessionReady) {
      if (this.startupOverflow) return;
      this.queuedBytes += frame.rawHeader.length + frame.payload.length;
      if (this.queuedBytes > MAX_STARTUP_BUFFER_BYTES || this.queuedFrames.length >= MAX_STARTUP_FRAMES) {
        this.startupOverflow = true;
        this.queuedFrames.length = 0;
        this.overflowClose = this.client.close().catch(() => undefined);
        return;
      }
      this.queuedFrames.push(frame);
    }
    else this.publishFrame(frame);
  };

  /** Wakes the reconnect loop if the owner stops during a live connection. */
  private readonly onStopped = (): void => {
    this.disconnect?.(new Error('RTSP stream session stopped.'));
  };

  /** Delivers the client's disconnect reason to the reconnect loop. */
  private readonly onDisconnected = (error: Error): void => {
    this.disconnect?.(error);
  };
}
