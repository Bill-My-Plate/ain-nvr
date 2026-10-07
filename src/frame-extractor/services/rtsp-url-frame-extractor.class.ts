import type { Logger } from '../../shared/index.js';
import { AinNvrError } from '../../shared/index.js';
import { decoderCandidates } from '../utils/decoder-candidates.util.js';
import { detectDecoderHostCapabilities } from '../utils/detect-decoder-host-capabilities.util.js';
import { isSaneFrame } from '../utils/is-sane-frame.util.js';
import { selectDecoder } from '../utils/select-decoder.util.js';
import { type DecoderHostCapabilities } from '../types/decoder-host-capabilities.interface.js';
import { FrameSampler } from './frame-sampler.class.js';
import type { LibavDecoderLike } from '../types/libav-decoder-like.type.js';
import type { LibavFormatContextLike } from '../types/libav-format-context-like.type.js';
import type { LibavFrameLike } from '../types/libav-frame-like.type.js';

import { NOOP_LOGGER } from '../constants/noop-logger.constant.js';
import type { FrameExtractorState } from '../types/frame-extractor-state.type.js';
import type { RtspUrlFrameExtractorOptions } from '../types/rtsp-url-frame-extractor-options.interface.js';
import type { QueuedFrame } from '../types/queued-frame.type.js';
import { positiveInteger } from '../utils/positive-integer.util.js';
import { delay } from '../utils/delay.util.js';
import { selectH264Stream } from '../utils/select-h264-stream.util.js';

export class RtspUrlFrameExtractor {
  private readonly logger: Logger;
  private readonly framesPerSecond: number;
  private readonly jpegQuality: number;
  private readonly mediaTimeoutMs: number;
  private readonly reconnectInitialMs: number;
  private readonly reconnectMaximumMs: number;
  private readonly capabilities: DecoderHostCapabilities;
  private readonly now: () => number;
  private readonly monotonicNow: () => bigint;
  private readonly stopController = new AbortController();
  private runPromise: Promise<void> | undefined;
  private activeContext: LibavFormatContextLike | undefined;
  private stateValue: FrameExtractorState = 'idle';
  private frameNumber = 0;
  private decodedFrames = 0;
  private emittedFrames = 0;
  private droppedFrames = 0;

  constructor(private readonly options: RtspUrlFrameExtractorOptions) {
    this.logger = options.logger ?? NOOP_LOGGER;
    this.framesPerSecond = options.framesPerSecond ?? 4;
    this.jpegQuality = options.jpegQuality ?? 0.9;
    this.mediaTimeoutMs = positiveInteger(options.mediaTimeoutMs, 15_000, 'mediaTimeoutMs');
    this.reconnectInitialMs = positiveInteger(
      options.reconnectInitialMs,
      1_000,
      'reconnectInitialMs',
    );
    this.reconnectMaximumMs = positiveInteger(
      options.reconnectMaximumMs,
      30_000,
      'reconnectMaximumMs',
    );
    if (!Number.isFinite(this.framesPerSecond)
      || this.framesPerSecond <= 0
      || this.framesPerSecond > 60) {
      throw new RangeError('framesPerSecond must be greater than 0 and at most 60.');
    }
    if (!Number.isFinite(this.jpegQuality) || this.jpegQuality <= 0 || this.jpegQuality > 1) {
      throw new RangeError('jpegQuality must be greater than 0 and at most 1.');
    }
    this.capabilities = options.capabilities ?? detectDecoderHostCapabilities();
    this.now = options.now ?? Date.now;
    this.monotonicNow = options.monotonicNow ?? process.hrtime.bigint;
  }

  get state(): FrameExtractorState {
    return this.stateValue;
  }

  get status(): Readonly<{
    state: FrameExtractorState;
    decodedFrames: number;
    emittedFrames: number;
    droppedFrames: number;
  }> {
    return {
      state: this.stateValue,
      decodedFrames: this.decodedFrames,
      emittedFrames: this.emittedFrames,
      droppedFrames: this.droppedFrames,
    };
  }

  start(): void {
    this.runPromise ??= this.run().catch((error: unknown) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(failure);
      this.logger.error('Frame extractor stopped after a fatal error.', {
        id: this.options.id,
        error: failure,
      });
      this.stateValue = 'stopped';
    });
  }

  async stop(): Promise<void> {
    if (!this.stopController.signal.aborted) {
      this.stopController.abort(new Error('Frame extractor stopped.'));
    }
    await this.activeContext?.close().catch(() => undefined);
    await this.runPromise;
    this.stateValue = 'stopped';
  }

  private async run(): Promise<void> {
    await this.options.runtime.initialize();
    let reconnectMs = this.reconnectInitialMs;
    while (!this.stopController.signal.aborted) {
      const decodedBefore = this.decodedFrames;
      this.stateValue = this.stateValue === 'idle' ? 'connecting' : 'reconnecting';
      try {
        await this.runSession();
        if (!this.stopController.signal.aborted) throw new Error('Decoded stream ended unexpectedly.');
      } catch (error) {
        if (this.stopController.signal.aborted) break;
        const failure = error instanceof Error ? error : new Error(String(error));
        this.options.onError?.(failure);
        this.logger.warn('Frame extraction failed; reconnecting.', {
          id: this.options.id,
          error: failure,
          reconnectMs,
        });
        if (this.decodedFrames > decodedBefore) reconnectMs = this.reconnectInitialMs;
        try {
          await delay(reconnectMs, this.stopController.signal);
        } catch {
          break;
        }
        reconnectMs = Math.min(reconnectMs * 2, this.reconnectMaximumMs);
      }
    }
  }

  private async runSession(): Promise<void> {
    const context = this.options.runtime.createFormatContext();
    this.activeContext = context;
    let decoder: LibavDecoderLike | undefined;
    let pending: QueuedFrame | undefined;
    let activeEncode: Promise<void> | undefined;
    let processingFailure: Error | undefined;
    let inactivityTimer: NodeJS.Timeout | undefined;
    let inactivityExpired = false;
    const sessionController = new AbortController();
    const stopSession = (): void => sessionController.abort(this.stopController.signal.reason);
    this.stopController.signal.addEventListener('abort', stopSession, { once: true });
    const sampler = new FrameSampler(this.framesPerSecond);

    const armInactivityTimer = (): void => {
      if (inactivityTimer !== undefined) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        inactivityExpired = true;
        sessionController.abort(new AinNvrError(
          'media_timeout',
          `No decoded frame was received for ${this.mediaTimeoutMs} ms.`,
        ));
        void context.close().catch(() => undefined);
      }, this.mediaTimeoutMs);
      inactivityTimer.unref();
    };

    const startEncode = (item: QueuedFrame): void => {
      activeEncode = (async () => {
        try {
          const jpeg = await this.options.runtime.toJpeg(item.frame, this.jpegQuality);
          const frameNumber = this.frameNumber++;
          await this.options.onFrame({
            data: jpeg,
            frameNumber,
            captureTimeMs: item.captureTimeMs,
            width: item.frame.width,
            height: item.frame.height,
            decoder: item.decoder,
          });
          this.emittedFrames += 1;
        } finally {
          item.frame.destroy();
        }
      })().catch((error: unknown) => {
        processingFailure = error instanceof Error ? error : new Error(String(error));
      }).finally(() => {
        activeEncode = undefined;
        if (pending !== undefined) {
          const next = pending;
          pending = undefined;
          if (processingFailure === undefined) startEncode(next);
          else next.frame.destroy();
        }
      });
    };

    const offer = (item: QueuedFrame): void => {
      if (activeEncode === undefined) {
        startEncode(item);
      } else if (pending === undefined) {
        pending = item;
      } else {
        item.frame.destroy();
        this.droppedFrames += 1;
      }
    };

    const processFrame = (frame: LibavFrameLike, decoderName: string): void => {
      if (!isSaneFrame(frame)) {
        frame.destroy();
        throw new Error('Decoder produced a frame with invalid dimensions.');
      }
      this.decodedFrames += 1;
      armInactivityTimer();
      if (!sampler.shouldCapture(this.monotonicNow())) {
        frame.destroy();
        return;
      }
      offer({ frame, captureTimeMs: this.now(), decoder: decoderName });
    };

    try {
      armInactivityTimer();
      await context.open(this.options.url, { rtsp_transport: 'tcp' });
      const stream = selectH264Stream(context);
      const selection = await selectDecoder(
        context,
        stream,
        this.options.runtime.keyPacketFlag,
        decoderCandidates(this.capabilities),
        sessionController.signal,
        this.logger,
      );
      decoder = selection.decoder;
      this.stateValue = 'extracting';
      processFrame(selection.firstFrame, selection.candidate.label);

      while (!sessionController.signal.aborted) {
        if (processingFailure !== undefined) throw processingFailure;
        const item = await context.receiveFrame([{ streamIndex: stream.index, decoder }]);
        if (sessionController.signal.aborted) { item?.destroy(); sessionController.signal.throwIfAborted(); }
        if (processingFailure !== undefined) {
          item?.destroy();
          throw processingFailure;
        }
        if (item === null || item === undefined) continue;
        if (item.type === 'packet') {
          item.destroy();
          continue;
        }
        processFrame(item, selection.candidate.label);
      }
    } catch (error) {
      if (inactivityExpired) {
        throw new AinNvrError(
          'media_timeout',
          `No decoded frame was received for ${this.mediaTimeoutMs} ms.`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      if (inactivityTimer !== undefined) clearTimeout(inactivityTimer);
      this.stopController.signal.removeEventListener('abort', stopSession);
      pending?.frame.destroy();
      pending = undefined;
      await activeEncode?.catch(() => undefined);
      decoder?.destroy();
      await context.close().catch(() => undefined);
      if (this.activeContext === context) this.activeContext = undefined;
    }
  }
}
