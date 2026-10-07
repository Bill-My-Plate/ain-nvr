import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { MessagePort } from 'node:worker_threads';
import { RtspStreamSession } from '../stream-session/index.js';
import { RtspLoopbackBridge } from '../stream-adapters/index.js';
import type { ExtractedJpegFrame } from '../frame-extractor/index.js';
import { CameraRecorder } from './camera-recorder.class.js';
import { DecoderProcess } from './decoder-process.class.js';
import { asError } from './as-error.util.js';
import { failure } from './failure.util.js';
import { serializeError } from './serialize-error.util.js';
import { terminalCameraError } from './terminal-camera-error.util.js';
import { type Command } from './command.type.js';
import { type FrameAck } from './frame-ack.type.js';
import { type FrameMessage } from './frame-message.type.js';
import { type FrameProfile } from './frame-profile.type.js';
import { type RecordingEvent } from './recording-event.type.js';
import { type RuntimeSettings } from './runtime-settings.type.js';
import { type WorkerMessage } from './worker-message.type.js';
import type { CameraStatus } from './camera-status.interface.js';

export class CameraEngine {
  private readonly session: RtspStreamSession;
  private readonly abort = new AbortController();
  private readonly loopDelay = monitorEventLoopDelay({ resolution: 20 });
  private readonly frames = new Map<string, { sequence: number; awaiting: boolean }>();
  private readonly events = new Set<number>();
  private readonly timer: NodeJS.Timeout;
  private readonly unsubscribe: () => void;
  private recorder: { id: string; value: CameraRecorder } | undefined;
  private decoder: DecoderProcess | undefined;
  private bridge: RtspLoopbackBridge | undefined;
  private profile: FrameProfile | undefined;
  private frameTransition: Promise<void> = Promise.resolve();
  private generation = 0;
  private state: CameraStatus['state'] = 'starting';
  private decoderState: CameraStatus['decoder'] = 'idle';
  private reconciliationNeeded = false;
  private statusPending = false;
  private progressPending = false;
  private delivered = 0;
  private dropped = 0;
  private sequence = 0;
  private closing: Promise<void> | undefined;
  private failedFrames = false;
  private firstFrameTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly cameraId: string,
    url: string,
    private readonly epoch: number,
    private readonly settings: RuntimeSettings,
    private readonly framePort: MessagePort,
    private readonly send: (message: WorkerMessage) => void,
  ) {
    this.session = new RtspStreamSession({ url });
    this.unsubscribe = this.session.subscribeSessionChanges(snapshot => {
      this.generation = snapshot.generation;
      // Outstanding old-generation JPEGs remain charged until acknowledged.
      if (this.frames.size > 0) this.scheduleFrames();
      this.publishStatus();
    });
    this.session.on('state', state => {
      if (this.abort.signal.aborted) return;
      this.state = state === 'streaming' ? 'streaming' : state === 'reconnecting' ? 'reconnecting' : 'starting';
      this.publishStatus();
    });
    this.session.on('reconnecting', error => {
      if (terminalCameraError(error)) {
        this.send({ kind: 'fatal', epoch, terminal: true, error: serializeError(error) });
        void this.close().catch(() => undefined);
      }
    });
    framePort.on('message', (ack: FrameAck) => {
      if (ack.epoch !== this.epoch) return;
      const frame = this.frames.get(ack.consumerId);
      if (frame?.sequence === ack.sequence) frame.awaiting = false;
    });
    framePort.start();
    this.loopDelay.enable();
    this.timer = setInterval(() => {
      if (this.progressPending && this.recorder !== undefined && !this.statusPending) {
        this.send({ kind: 'progress', epoch, consumerId: this.recorder.id });
        this.progressPending = false;
      }
      this.publishStatus();
    }, 1_000);
    this.timer.unref();
  }

  async start(): Promise<void> {
    await this.session.start(AbortSignal.any([this.abort.signal, AbortSignal.timeout(this.settings.acquireTimeoutMs)]));
  }
  get streamGeneration(): number { return this.generation; }
  acknowledgeEvent(sequence: number, failed: boolean): void {
    this.events.delete(sequence);
    if (failed) this.reconciliationNeeded = true;
  }
  acknowledgeStatus(): void { this.statusPending = false; }

  async execute(command: Command): Promise<void> {
    if (command.type === 'close') return this.close();
    this.abort.signal.throwIfAborted();
    if (command.type === 'record') {
      if (this.recorder !== undefined) throw failure('EEXIST', 'Camera already has a recording owner.');
      const recorder = new CameraRecorder(this.session, {
        ...command.options, cameraId: this.cameraId,
        onCommitted: segment => this.recordingEvent(command.consumerId, { type: 'committed', segment }),
        onSessionClosed: (cameraId, sessionStartMs) => this.recordingEvent(command.consumerId, { type: 'session-closed', cameraId, sessionStartMs }),
        onError: error => {
          this.reconciliationNeeded = true;
          this.send({ kind: 'consumer-error', epoch: this.epoch, consumerId: command.consumerId, error: serializeError(error) });
        },
        onProgress: () => { this.progressPending = true; },
      });
      this.recorder = { id: command.consumerId, value: recorder };
      try { await recorder.start(); }
      catch (error) {
        await recorder.stop().catch(() => undefined);
        this.recorder = undefined;
        throw error;
      }
    } else if (command.type === 'frames') {
      if (this.frames.size >= this.settings.maxFrameSubscribers) throw failure('ENOSPC', 'Frame subscriber limit reached.');
      if (this.profile !== undefined && JSON.stringify(this.profile) !== JSON.stringify(command.profile)) {
        throw failure('EINVAL', 'Camera frame subscribers must use the same FPS and JPEG quality.');
      }
      this.profile = command.profile;
      this.frames.set(command.consumerId, { sequence: 0, awaiting: false });
      if (this.decoder === undefined) this.scheduleFrames();
      await this.frameTransition;
      if (!this.frames.has(command.consumerId)) throw failure('decoder_unavailable', 'Camera decoder could not start.');
    } else if (command.type === 'boundary') {
      if (this.recorder?.id !== command.consumerId) throw failure('ENOENT', 'Recording is no longer active.');
      this.recorder.value.requestBoundary();
    } else if (command.type === 'stop') {
      if (this.recorder?.id === command.consumerId) {
        const recorder = this.recorder;
        try { await recorder.value.stop(); }
        finally { this.recorder = undefined; }
      }
      if (this.frames.delete(command.consumerId) && this.frames.size === 0) {
        await this.frameTransition;
        await this.stopDecoder();
        this.profile = undefined;
      }
    }
    this.publishStatus();
  }

  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    this.abort.abort(new Error('Camera engine is closing.'));
    this.state = 'closing';
    this.unsubscribe();
    this.frames.clear();
    clearInterval(this.timer);
    this.loopDelay.disable();
    this.closing = (async () => {
      const results = await Promise.allSettled([
        this.recorder?.value.stop(),
        this.frameTransition.then(() => this.stopDecoder()),
      ]);
      await this.session.stop();
      this.recorder = undefined;
      this.state = 'closed';
      this.publishStatus();
      this.framePort.close();
      const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (errors.length) throw new AggregateError(errors.map(r => r.reason), 'Camera shutdown could not finalize all consumers.');
    })();
    return this.closing;
  }

  private scheduleFrames(): void {
    const generation = this.generation;
    this.failedFrames = false;
    this.decoderState = 'starting';
    this.frameTransition = this.frameTransition.then(async () => {
      await this.stopDecoder();
      if (this.frames.size === 0 || this.abort.signal.aborted || generation !== this.generation) return;
      this.failedFrames = false;
      const bridge = new RtspLoopbackBridge({ source: this.session });
      this.bridge = bridge;
      const url = await bridge.start();
      const decoder = new DecoderProcess(this.settings,
        frame => { if (generation === this.generation) this.deliver(frame, generation); },
        error => this.failFrames(error),
      );
      this.decoder = decoder;
      this.decoderState = 'starting';
      this.firstFrameTimer = setTimeout(() => this.failFrames(failure('ETIMEDOUT', 'Decoder produced no JPEG before its deadline.')), this.settings.firstFrameTimeoutMs);
      await decoder.start(url, this.cameraId, this.profile!);
    }).catch(error => this.failFrames(asError(error)));
  }

  private async stopDecoder(): Promise<void> {
    clearTimeout(this.firstFrameTimer);
    const decoder = this.decoder;
    const bridge = this.bridge;
    this.decoder = undefined;
    this.bridge = undefined;
    try { await decoder?.stop(); }
    finally { await bridge?.stop(); }
    this.decoderState = 'idle';
  }
  private failFrames(error: Error): void {
    if (this.failedFrames || this.abort.signal.aborted) return;
    this.failedFrames = true;
    this.decoderState = 'failed';
    for (const consumerId of this.frames.keys()) {
      this.send({ kind: 'consumer-error', epoch: this.epoch, consumerId, error: serializeError(error) });
    }
    this.frames.clear();
    this.profile = undefined;
    // Schedule outside the failed transition to avoid waiting on ourselves.
    this.frameTransition = this.frameTransition.then(() => this.stopDecoder()).catch(error => {
      this.send({ kind: 'fatal', epoch: this.epoch, terminal: false, error: serializeError(error) });
    });
    this.publishStatus();
  }
  private deliver(frame: ExtractedJpegFrame, generation: number): void {
    if (this.abort.signal.aborted) return;
    clearTimeout(this.firstFrameTimer);
    this.decoderState = 'ready';
    for (const [consumerId, slot] of this.frames) {
      if (slot.awaiting || frame.data.length > this.settings.maximumFrameBytes
        || Date.now() - frame.captureTimeMs > this.settings.maximumFrameAgeMs) {
        this.dropped++;
        continue;
      }
      slot.awaiting = true;
      slot.sequence++;
      const message: FrameMessage = {
        kind: 'frame', epoch: this.epoch, generation, consumerId, sequence: slot.sequence,
        frame: { ...frame, data: Buffer.from(frame.data) },
      };
      this.framePort.postMessage(message);
      this.delivered++;
    }
  }
  private recordingEvent(consumerId: string, event: RecordingEvent): void {
    if (this.events.size >= this.settings.maximumPendingEvents) {
      this.reconciliationNeeded = true;
      this.publishStatus();
      return;
    }
    const sequence = ++this.sequence;
    this.events.add(sequence);
    this.send({ kind: 'event', epoch: this.epoch, sequence, consumerId, event });
  }
  private publishStatus(): void {
    if (this.statusPending) return;
    this.statusPending = true;
    const delay = this.loopDelay.max / 1e6;
    this.loopDelay.reset();
    this.send({ kind: 'status', epoch: this.epoch, status: {
      cameraId: this.cameraId, state: this.state, workerEpoch: this.epoch,
      streamGeneration: this.generation, recording: this.recorder !== undefined,
      decoder: this.decoderState, framesDelivered: this.delivered, framesDropped: this.dropped,
      recordingQueuedBytes: this.recorder?.value.queuedBytes ?? 0,
      workerEventLoopDelayMs: Number.isFinite(delay) ? delay : 0,
      reconciliationNeeded: this.reconciliationNeeded,
    } });
  }
}
