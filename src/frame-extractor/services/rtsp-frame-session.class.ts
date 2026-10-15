import { AinNvrError } from '../../shared/index.js';
import { decoderCandidates } from '../utils/decoder-candidates.util.js';
import { isSaneFrame } from '../utils/is-sane-frame.util.js';
import { selectDecoder } from '../utils/select-decoder.util.js';
import { selectH264Stream } from '../utils/select-h264-stream.util.js';
import type { LibavDecoderLike } from '../types/libav-decoder-like.type.js';
import type { LibavFrameLike } from '../types/libav-frame-like.type.js';
import type { RtspFrameSessionOptions } from '../types/rtsp-frame-session-options.type.js';
import { FrameInactivityWatchdog } from './frame-inactivity-watchdog.class.js';
import { FrameJpegQueue } from './frame-jpeg-queue.class.js';
import { FrameSampler } from './frame-sampler.class.js';

/** Owns the demuxer, decoder, sampling, and delivery for one RTSP connection. */
export class RtspFrameSession {
  private readonly context;
  private readonly sessionController = new AbortController();
  private readonly sampler: FrameSampler;
  private readonly queue: FrameJpegQueue;
  private readonly watchdog: FrameInactivityWatchdog;

  /** Allocates one libav context and its per-connection helpers. */
  public constructor(private readonly options: RtspFrameSessionOptions) {
    this.context = options.runtime.createFormatContext();
    this.sampler = new FrameSampler(options.framesPerSecond);
    this.queue = new FrameJpegQueue(options);
    this.watchdog = new FrameInactivityWatchdog(
      this.context,
      this.sessionController,
      options.mediaTimeoutMs,
    );
  }

  /** Closes the context so a pending libav read can return during shutdown. */
  public async stop(): Promise<void> {
    await this.context.close().catch(() => undefined);
  }

  /** Opens the source, selects a decoder, reads frames, and releases all resources. */
  public async run(): Promise<void> {
    let decoder: LibavDecoderLike | undefined;
    const stopSession = (): void => this.sessionController.abort(this.options.stopSignal.reason);
    this.options.stopSignal.addEventListener('abort', stopSession, { once: true });
    try {
      this.watchdog.arm();
      await this.context.open(this.options.url, { rtsp_transport: 'tcp' });
      const stream = selectH264Stream(this.context);
      const selection = await selectDecoder(
        this.context,
        stream,
        this.options.runtime.keyPacketFlag,
        decoderCandidates(this.options.capabilities),
        this.sessionController.signal,
      );
      decoder = selection.decoder;
      this.options.onState('extracting');
      this.processFrame(selection.firstFrame, selection.candidate.label);

      while (!this.sessionController.signal.aborted) {
        if (this.queue.failure !== undefined) throw this.queue.failure;
        const item = await this.context.receiveFrame([{ streamIndex: stream.index, decoder }]);
        if (this.sessionController.signal.aborted) {
          item?.destroy();
          this.sessionController.signal.throwIfAborted();
        }
        if (this.queue.failure !== undefined) {
          item?.destroy();
          throw this.queue.failure;
        }
        if (item === null || item === undefined) continue;
        if (item.type === 'packet') {
          item.destroy();
          continue;
        }
        this.processFrame(item, selection.candidate.label);
      }
    } catch (error) {
      if (this.watchdog.expired) {
        throw new AinNvrError(
          'media_timeout',
          `No decoded frame was received for ${this.options.mediaTimeoutMs} ms.`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      this.watchdog.clear();
      this.options.stopSignal.removeEventListener('abort', stopSession);
      await this.queue.close();
      decoder?.destroy();
      await this.context.close().catch(() => undefined);
    }
  }

  /** Validates, counts, samples, and transfers ownership of a decoded frame. */
  private processFrame(frame: LibavFrameLike, decoderName: string): void {
    if (!isSaneFrame(frame)) {
      frame.destroy();
      throw new Error('Decoder produced a frame with invalid dimensions.');
    }
    this.options.onDecoded();
    this.watchdog.arm();
    if (!this.sampler.shouldCapture(this.options.monotonicNow())) {
      frame.destroy();
      return;
    }
    this.queue.offer({ frame, captureTimeMs: this.options.now(), decoder: decoderName });
  }
}
