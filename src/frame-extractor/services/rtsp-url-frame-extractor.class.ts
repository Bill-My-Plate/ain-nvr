import { FRAME_EXTRACTOR_CONSTANTS } from '../constants/frame-extractor-numeric-values.constant.js';
import type { DecoderHostCapabilities } from '../types/decoder-host-capabilities.interface.js';
import type { FrameExtractorState } from '../types/frame-extractor-state.type.js';
import type { RtspUrlFrameExtractorOptions } from '../types/rtsp-url-frame-extractor-options.interface.js';
import { delay } from '../utils/delay.util.js';
import { detectDecoderHostCapabilities } from '../utils/detect-decoder-host-capabilities.util.js';
import { positiveInteger } from '../utils/positive-integer.util.js';
import { RtspFrameSession } from './rtsp-frame-session.class.js';

/** Connects to an RTSP URL and retries individual decoding sessions until stopped. */
export class RtspUrlFrameExtractor {
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
  private activeSession: RtspFrameSession | undefined;
  private stateValue: FrameExtractorState = 'idle';
  private frameNumber = 0;
  private decodedFrames = 0;
  private emittedFrames = 0;
  private droppedFrames = 0;

  /** Validates the public settings and resolves defaults. */
  public constructor(private readonly options: RtspUrlFrameExtractorOptions) {
    this.framesPerSecond =
      options.framesPerSecond ?? FRAME_EXTRACTOR_CONSTANTS.defaultFramesPerSecond;
    this.jpegQuality = options.jpegQuality ?? FRAME_EXTRACTOR_CONSTANTS.defaultJpegQuality;
    this.mediaTimeoutMs = positiveInteger(
      options.mediaTimeoutMs,
      FRAME_EXTRACTOR_CONSTANTS.defaultMediaTimeoutMs,
      'mediaTimeoutMs',
    );
    this.reconnectInitialMs = positiveInteger(
      options.reconnectInitialMs,
      FRAME_EXTRACTOR_CONSTANTS.defaultReconnectInitialMs,
      'reconnectInitialMs',
    );
    this.reconnectMaximumMs = positiveInteger(
      options.reconnectMaximumMs,
      FRAME_EXTRACTOR_CONSTANTS.defaultReconnectMaximumMs,
      'reconnectMaximumMs',
    );
    if (
      !Number.isFinite(this.framesPerSecond) ||
      this.framesPerSecond <= 0 ||
      this.framesPerSecond > FRAME_EXTRACTOR_CONSTANTS.maximumFramesPerSecond
    ) {
      throw new RangeError('framesPerSecond must be greater than 0 and at most 60.');
    }
    if (!Number.isFinite(this.jpegQuality) || this.jpegQuality <= 0 || this.jpegQuality > 1) {
      throw new RangeError('jpegQuality must be greater than 0 and at most 1.');
    }
    this.capabilities = options.capabilities ?? detectDecoderHostCapabilities();
    this.now = options.now ?? Date.now;
    this.monotonicNow = options.monotonicNow ?? process.hrtime.bigint;
  }

  /** Returns the current lifecycle state. */
  public get state(): FrameExtractorState {
    return this.stateValue;
  }

  /** Returns a snapshot of decoded, delivered, and queue-rejected frames. */
  public get status(): Readonly<{
    /** Current extractor lifecycle state. */
    state: FrameExtractorState;
    /** Number of decoded frames seen by the extractor. */
    decodedFrames: number;
    /** Number of JPEG frames delivered to callbacks. */
    emittedFrames: number;
    /** Number of frames skipped or rejected. */
    droppedFrames: number;
  }> {
    return {
      state: this.stateValue,
      decodedFrames: this.decodedFrames,
      emittedFrames: this.emittedFrames,
      droppedFrames: this.droppedFrames,
    };
  }

  /** Initializes the runtime and starts retrying RTSP sessions. */
  public start(): void {
    this.runPromise ??= this.run().catch((error: unknown) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(failure);
      this.stateValue = 'stopped';
    });
  }

  /** Cancels retries, closes the active context, and waits for cleanup. */
  public async stop(): Promise<void> {
    if (!this.stopController.signal.aborted) {
      this.stopController.abort(new Error('Frame extractor stopped.'));
    }
    await this.activeSession?.stop();
    await this.runPromise;
    this.stateValue = 'stopped';
  }

  /** Reconnects after a failed session, resetting delay if any frame was decoded. */
  private async run(): Promise<void> {
    await this.options.runtime.initialize();
    let reconnectMs = this.reconnectInitialMs;
    while (!this.stopController.signal.aborted) {
      const decodedBefore = this.decodedFrames;
      this.stateValue = this.stateValue === 'idle' ? 'connecting' : 'reconnecting';
      try {
        const session = new RtspFrameSession({
          url: this.options.url,
          runtime: this.options.runtime,
          stopSignal: this.stopController.signal,
          mediaTimeoutMs: this.mediaTimeoutMs,
          framesPerSecond: this.framesPerSecond,
          jpegQuality: this.jpegQuality,
          capabilities: this.capabilities,
          now: this.now,
          monotonicNow: this.monotonicNow,
          onFrame: this.options.onFrame,
          onState: (state) => { this.stateValue = state; },
          onDecoded: () => { this.decodedFrames += 1; },
          onEmitted: () => { this.emittedFrames += 1; },
          onDropped: () => { this.droppedFrames += 1; },
          nextFrameNumber: () => this.frameNumber++,
        });
        this.activeSession = session;
        try {
          await session.run();
        } finally {
          if (this.activeSession === session) this.activeSession = undefined;
        }
        if (!this.stopController.signal.aborted)
          throw new Error('Decoded stream ended unexpectedly.');
      } catch (error) {
        if (this.stopController.signal.aborted) break;
        const failure = error instanceof Error ? error : new Error(String(error));
        this.options.onError?.(failure);
        if (this.decodedFrames > decodedBefore) reconnectMs = this.reconnectInitialMs;
        try {
          await delay(reconnectMs, this.stopController.signal);
        } catch {
          break;
        }
        reconnectMs = Math.min(
          reconnectMs * FRAME_EXTRACTOR_CONSTANTS.reconnectBackoffMultiplier,
          this.reconnectMaximumMs,
        );
      }
    }
  }
}
