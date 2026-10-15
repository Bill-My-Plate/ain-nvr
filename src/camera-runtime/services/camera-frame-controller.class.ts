import { failure, type FrameProfile } from '../../camera/index.js';
import type { ExtractedJpegFrame } from '../../frame-extractor/index.js';
import { asError } from '../../shared/index.js';
import { RtspLoopbackBridge } from '../../stream-adapters/index.js';
import type { RtspStreamSession } from '../../stream-session/index.js';
import type { MessagePort } from 'node:worker_threads';
import { DecoderProcess } from './decoder-process.class.js';
import { serializeError } from '../utils/serialize-error.util.js';
import type { FrameAck } from '../types/frame-ack.type.js';
import type { FrameMessage } from '../types/frame-message.type.js';
import type { RuntimeSettings } from '../types/runtime-settings.type.js';
import type { WorkerMessage } from '../types/worker-message.type.js';

/** Owns frame subscribers, their acknowledgements, and the shared decoder lifecycle. */
export class CameraFrameController {
  private readonly frames = new Map<string, { sequence: number; awaiting: boolean }>();
  private decoder: DecoderProcess | undefined;
  private bridge: RtspLoopbackBridge | undefined;
  private profile: FrameProfile | undefined;
  private transition: Promise<void> = Promise.resolve();
  private state: 'idle' | 'starting' | 'ready' | 'failed' = 'idle';
  private failed = false;
  private firstFrameTimer: NodeJS.Timeout | undefined;
  private delivered = 0;
  private dropped = 0;

  /** Attaches acknowledgements to the frame port and starts receiving them. */
  public constructor(
    private readonly session: RtspStreamSession,
    private readonly cameraId: string,
    private readonly epoch: number,
    private readonly settings: RuntimeSettings,
    private readonly framePort: MessagePort,
    private readonly signal: AbortSignal,
    private readonly getGeneration: () => number,
    private readonly send: (message: WorkerMessage) => void,
    private readonly onStatusChange: () => void,
  ) {
    framePort.on('message', (ack: FrameAck) => {
      if (ack.epoch !== this.epoch) return;
      const frame = this.frames.get(ack.consumerId);
      if (frame?.sequence === ack.sequence) frame.awaiting = false;
    });
    framePort.start();
  }

  /** Current decoder state included in camera status. */
  public get decoderState(): 'idle' | 'starting' | 'ready' | 'failed' {
    return this.state;
  }

  /** Number of frames delivered to subscribers. */
  public get framesDelivered(): number {
    return this.delivered;
  }

  /** Number of frames omitted by backpressure, size, or age limits. */
  public get framesDropped(): number {
    return this.dropped;
  }

  /** Replaces the decoder when an active stream enters a new generation. */
  public onGeneration(): void {
    // Old-generation frames stay charged until their acknowledgements arrive.
    if (this.frames.size > 0) this.scheduleFrames();
  }

  /** Registers a frame consumer and waits for the shared decoder to start. */
  public async start(consumerId: string, profile: FrameProfile): Promise<void> {
    if (this.frames.size >= this.settings.maxFrameSubscribers)
      throw failure('ENOSPC', 'Frame subscriber limit reached.');
    if (this.profile !== undefined && JSON.stringify(this.profile) !== JSON.stringify(profile))
      throw failure('EINVAL', 'Camera frame subscribers must use the same FPS and JPEG quality.');
    this.profile = profile;
    this.frames.set(consumerId, { sequence: 0, awaiting: false });
    if (this.decoder === undefined) this.scheduleFrames();
    await this.transition;
    if (!this.frames.has(consumerId))
      throw failure('decoder_unavailable', 'Camera decoder could not start.');
  }

  /** Removes one consumer and stops the decoder when the last one leaves. */
  public async stop(consumerId: string): Promise<void> {
    if (this.frames.delete(consumerId) && this.frames.size === 0) {
      await this.transition;
      await this.stopDecoder();
      this.profile = undefined;
    }
  }

  /** Prevents further frame delivery as soon as engine shutdown begins. */
  public beginClose(): void {
    this.frames.clear();
  }

  /** Waits for any decoder transition and releases decoder and bridge resources. */
  public closeDecoder(): Promise<void> {
    return this.transition.then(() => this.stopDecoder());
  }

  /** Closes the frame port after the stream session has stopped. */
  public closePort(): void {
    this.framePort.close();
  }

  /** Starts a decoder transition for the current stream generation. */
  private scheduleFrames(): void {
    const generation = this.getGeneration();
    this.failed = false;
    this.state = 'starting';
    this.transition = this.transition
      .then(async () => {
        await this.stopDecoder();
        if (this.frames.size === 0 || this.signal.aborted || generation !== this.getGeneration())
          return;
        this.failed = false;
        const bridge = new RtspLoopbackBridge({ source: this.session });
        this.bridge = bridge;
        const url = await bridge.start();
        const decoder = new DecoderProcess(
          this.settings,
          (frame) => {
            if (generation === this.getGeneration()) this.deliver(frame, generation);
          },
          (error) => this.failFrames(error),
        );
        this.decoder = decoder;
        this.state = 'starting';
        this.firstFrameTimer = setTimeout(
          () => this.failFrames(failure('ETIMEDOUT', 'Decoder produced no JPEG before its deadline.')),
          this.settings.firstFrameTimeoutMs,
        );
        await decoder.start(url, this.cameraId, this.profile!);
      })
      .catch((error) => this.failFrames(asError(error)));
  }

  /** Stops the child decoder before releasing its loopback RTSP bridge. */
  private async stopDecoder(): Promise<void> {
    clearTimeout(this.firstFrameTimer);
    const decoder = this.decoder;
    const bridge = this.bridge;
    this.decoder = undefined;
    this.bridge = undefined;
    try {
      await decoder?.stop();
    } finally {
      await bridge?.stop();
    }
    this.state = 'idle';
  }

  /** Fails all frame consumers once and schedules decoder cleanup. */
  private failFrames(error: Error): void {
    if (this.failed || this.signal.aborted) return;
    this.failed = true;
    this.state = 'failed';
    for (const consumerId of this.frames.keys()) {
      this.send({
        kind: 'consumer-error',
        epoch: this.epoch,
        consumerId,
        error: serializeError(error),
      });
    }
    this.frames.clear();
    this.profile = undefined;
    // Schedule outside the failed transition to avoid waiting on ourselves.
    this.transition = this.transition
      .then(() => this.stopDecoder())
      .catch((error) => {
        this.send({
          kind: 'fatal',
          epoch: this.epoch,
          terminal: false,
          error: serializeError(error),
        });
      });
    this.onStatusChange();
  }

  /** Sends a private frame copy to each consumer without overrunning its ack slot. */
  private deliver(frame: ExtractedJpegFrame, generation: number): void {
    if (this.signal.aborted) return;
    clearTimeout(this.firstFrameTimer);
    this.state = 'ready';
    for (const [consumerId, slot] of this.frames) {
      if (
        slot.awaiting ||
        frame.data.length > this.settings.maximumFrameBytes ||
        Date.now() - frame.captureTimeMs > this.settings.maximumFrameAgeMs
      ) {
        this.dropped++;
        continue;
      }
      slot.awaiting = true;
      slot.sequence++;
      const message: FrameMessage = {
        kind: 'frame',
        epoch: this.epoch,
        generation,
        consumerId,
        sequence: slot.sequence,
        frame: { ...frame, data: Buffer.from(frame.data) },
      };
      this.framePort.postMessage(message);
      this.delivered++;
    }
  }
}
