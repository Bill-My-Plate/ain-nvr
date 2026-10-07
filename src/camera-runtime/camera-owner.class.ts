

import { setTimeout as delay } from 'node:timers/promises';
import { CameraWorkerHost } from './camera-worker-host.class.js';
import { StartupLimiter } from './startup-limiter.class.js';
import { frameProfile } from './frame-profile.util.js';
import { recordingConfiguration } from './recording-configuration.util.js';
import { asError } from './as-error.util.js';
import { deadline } from './deadline.util.js';
import { deferred } from './deferred.util.js';
import { deserializeError } from './deserialize-error.util.js';
import { failure } from './failure.util.js';
import { type FrameMessage } from './frame-message.type.js';
import { type RuntimeSettings } from './runtime-settings.type.js';
import { type WorkerMessage } from './worker-message.type.js';
import type { CameraStatus } from './camera-status.interface.js';
import type { FrameHandle } from './frame-handle.interface.js';
import type { FrameOptions } from './frame-options.interface.js';
import type { RecordingHandle } from './recording-handle.interface.js';
import type { RecordingOptions } from './recording-options.interface.js';

import type { RecordingConsumer } from './recording-consumer.type.js';
import type { FrameConsumer } from './frame-consumer.type.js';
import type { Consumer } from './consumer.type.js';
import { verifyNativeAssets } from './verify-native-assets.util.js';

export class CameraOwner {
  readonly started: Promise<void>;
  readonly consumers = new Map<string, Consumer>();
  readonly listeners = new Set<(status: CameraStatus) => void>();
  references = 0;
  closing: Promise<void> | undefined;
  private readonly abort = new AbortController();
  private host: CameraWorkerHost | undefined;
  private recovery: Promise<void> | undefined;
  private initialized = false;
  private terminalError: Error | undefined;
  private epoch = 0;
  private restarts = 0;
  private nextConsumer = 0;
  private statusValue: CameraStatus;

  constructor(
    readonly cameraId: string,
    readonly url: string,
    readonly settings: RuntimeSettings,
    private readonly limiter: StartupLimiter,
  ) {
    this.statusValue = {
      cameraId, state: 'starting', workerEpoch: 0, streamGeneration: 0,
      recording: false, decoder: 'idle', framesDelivered: 0, framesDropped: 0,
      recordingQueuedBytes: 0, workerEventLoopDelayMs: 0, reconciliationNeeded: false,
    };
    this.started = Promise.resolve().then(() => this.spawn()).then(() => { this.initialized = true; });
    void this.started.catch(() => undefined);
  }
  get status(): CameraStatus { return { ...this.statusValue }; }
  async ready(): Promise<void> {
    await this.started;
    await this.recovery;
    this.assertOpen();
  }
  subscribe(listener: (status: CameraStatus) => void): () => void {
    this.assertOpen();
    if (this.listeners.size >= this.settings.maxLeasesPerCamera) throw failure('ENOSPC', 'Status subscriber limit reached.');
    const subscription = (status: CameraStatus): void => listener(status);
    this.listeners.add(subscription);
    return () => { this.listeners.delete(subscription); };
  }

  async startRecording(options: RecordingOptions): Promise<{ id: string; handle: RecordingHandle }> {
    this.assertOpen();
    const configuration = recordingConfiguration(options);
    if ([...this.consumers.values()].some(c => c.kind === 'record')) throw failure('EEXIST', 'Camera already has a recording owner.');
    const consumer: RecordingConsumer = {
      id: String(++this.nextConsumer), kind: 'record', options, configuration,
      active: true, completion: deferred<void>(), events: Promise.resolve(), deliveryFailed: false,
    };
    this.consumers.set(consumer.id, consumer);
    try {
      await this.ready();
      this.assertActive(consumer);
      await this.host!.request({ type: 'record', consumerId: consumer.id, options: configuration });
      this.assertActive(consumer);
    } catch (error) {
      await this.stopConsumer(consumer, asError(error)).catch(() => undefined);
      throw error;
    }
    return { id: consumer.id, handle: {
      completion: consumer.completion.promise,
      stop: () => this.stopConsumer(consumer),
      requestBoundary: async () => {
        await this.ready();
        this.assertActive(consumer);
        await this.host!.request({ type: 'boundary', consumerId: consumer.id });
      },
    } };
  }

  async startFrames(options: FrameOptions): Promise<{ id: string; handle: FrameHandle }> {
    this.assertOpen();
    const profile = frameProfile(options);
    const frames = [...this.consumers.values()].filter((c): c is FrameConsumer => c.kind === 'frames');
    if (frames.length >= this.settings.maxFrameSubscribers) throw failure('ENOSPC', 'Frame subscriber limit reached.');
    if (frames.some(c => JSON.stringify(c.profile) !== JSON.stringify(profile))) throw failure('EINVAL', 'Camera frame subscribers must use the same FPS and JPEG quality.');
    const consumer: FrameConsumer = {
      id: String(++this.nextConsumer), kind: 'frames', options, profile,
      active: true, completion: deferred<void>(), ready: deferred<void>(),
      timer: undefined, frameNumber: 0, busy: false,
    };
    this.consumers.set(consumer.id, consumer);
    try {
      await this.ready();
      await verifyNativeAssets();
      this.assertActive(consumer);
      this.armFrameDeadline(consumer);
      await this.host!.request({ type: 'frames', consumerId: consumer.id, profile });
      this.assertActive(consumer);
    } catch (error) {
      await this.stopConsumer(consumer, asError(error)).catch(() => undefined);
      throw error;
    }
    return { id: consumer.id, handle: {
      ready: consumer.ready.promise, completion: consumer.completion.promise,
      stop: () => this.stopConsumer(consumer),
    } };
  }

  stop(id: string): Promise<void> {
    const consumer = this.consumers.get(id);
    return consumer === undefined ? Promise.resolve() : this.stopConsumer(consumer);
  }
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    this.abort.abort(failure('ECLOSED', 'Camera owner is closing.'));
    this.update({ state: 'closing' });
    for (const c of this.consumers.values()) {
      c.active = false;
      if (c.kind === 'frames') { clearTimeout(c.timer); c.ready.reject(this.abort.signal.reason); }
    }
    this.closing = Promise.resolve().then(async () => {
      // Start closing immediately to interrupt a negotiation or stuck operation.
      const early = this.host?.close();
      void early?.catch(() => undefined);
      await this.started.catch(() => undefined);
      await this.recovery?.catch(() => undefined);
      let closeError: unknown;
      try { await early; await this.host?.close(); }
      catch (error) { closeError = error; this.update({ reconciliationNeeded: true, lastError: asError(error) }); }
      for (const c of this.consumers.values()) {
        if (closeError === undefined) c.completion.resolve();
        else { c.completion.reject(closeError); this.report(c, asError(closeError)); }
      }
      this.consumers.clear();
      this.update({ state: 'closed', recording: false, decoder: 'idle' });
      this.listeners.clear();
      if (closeError !== undefined) throw closeError;
    });
    return this.closing;
  }

  private async spawn(): Promise<void> {
    await this.limiter.run(this.abort.signal, async () => {
      const epoch = ++this.epoch;
      this.update({ workerEpoch: epoch, streamGeneration: 0 });
      this.host = new CameraWorkerHost(this.cameraId, this.url, epoch, this.settings,
        message => this.message(message), frame => this.frame(frame),
        (error, terminal) => this.failed(error, terminal),
      );
      await this.host.start();
    });
  }
  private failed(error: Error, terminal: boolean): void {
    if (this.abort.signal.aborted) return;
    this.update({ lastError: error, reconciliationNeeded: true });
    if (!this.initialized) { this.terminalError = error; return; }
    if (this.recovery !== undefined) { this.terminalError = error; return; }
    if (terminal || this.restarts >= this.settings.maxWorkerRestarts) {
      this.failAll(error);
      void this.host?.close().catch(() => undefined);
      return;
    }
    this.restarts++;
    this.update({ state: 'restarting', decoder: 'idle', recording: false });
    for (const c of this.consumers.values()) if (c.kind === 'frames') clearTimeout(c.timer);
    this.recovery = Promise.resolve().then(async () => {
      await this.host?.close().catch(() => undefined);
      await delay(this.settings.restartDelayMs, undefined, { signal: this.abort.signal });
      this.terminalError = undefined;
      await this.spawn();
      for (const c of this.consumers.values()) {
        if (!c.active) continue;
        try {
          if (c.kind === 'record') await this.host!.request({ type: 'record', consumerId: c.id, options: c.configuration });
          else {
            this.armFrameDeadline(c);
            await this.host!.request({ type: 'frames', consumerId: c.id, profile: c.profile });
          }
        } catch (error) {
          if (this.terminalError !== undefined) throw this.terminalError;
          void this.stopConsumer(c, asError(error)).catch(() => undefined);
        }
      }
      if (this.terminalError !== undefined) throw this.terminalError;
      this.update({ state: 'streaming' });
    }).catch(error => {
      if (!this.abort.signal.aborted) this.failAll(asError(error));
      void this.host?.close().catch(() => undefined);
    }).finally(() => { this.recovery = undefined; });
  }
  private failAll(error: Error): void {
    this.terminalError = error;
    this.update({ state: 'failed', lastError: error, recording: false, decoder: 'failed' });
    for (const consumer of this.consumers.values()) {
      consumer.active = false;
      consumer.completion.reject(error);
      if (consumer.kind === 'frames') { clearTimeout(consumer.timer); consumer.ready.reject(error); }
      this.report(consumer, error);
    }
  }

  private stopConsumer(consumer: Consumer, error?: Error): Promise<void> {
    if (consumer.stopping !== undefined) return consumer.stopping;
    consumer.active = false;
    if (consumer.kind === 'frames') {
      clearTimeout(consumer.timer);
      consumer.ready.reject(error ?? failure('ECLOSED', 'Frame subscription stopped before its first frame.'));
    }
    if (error !== undefined) { consumer.completion.reject(error); this.report(consumer, error); }
    consumer.stopping = Promise.resolve().then(async () => {
      let stoppedError: unknown;
      try {
        await this.started.catch(() => undefined);
        await this.recovery;
        if (!this.abort.signal.aborted && this.terminalError === undefined) {
          await this.host?.request({ type: 'stop', consumerId: consumer.id });
        } else if (this.terminalError !== undefined) {
          await this.host?.close();
        }
      } catch (cause) { stoppedError = cause; }
      finally {
        this.consumers.delete(consumer.id);
        if (stoppedError === undefined) consumer.completion.resolve();
        else {
          consumer.completion.reject(stoppedError);
          this.report(consumer, asError(stoppedError));
          this.update({ reconciliationNeeded: consumer.kind === 'record' || this.statusValue.reconciliationNeeded });
        }
      }
      if (stoppedError !== undefined) throw stoppedError;
    });
    return consumer.stopping;
  }
  private armFrameDeadline(consumer: FrameConsumer): void {
    clearTimeout(consumer.timer);
    consumer.timer = setTimeout(() => {
      void this.stopConsumer(consumer, failure('ETIMEDOUT', 'Camera produced no JPEG before the first-frame deadline.')).catch(() => undefined);
    }, this.settings.firstFrameTimeoutMs);
  }
  private frame(message: FrameMessage): void {
    const host = this.host;
    const ack = (): void => host?.acknowledgeFrame({ epoch: message.epoch, consumerId: message.consumerId, sequence: message.sequence });
    const consumer = this.consumers.get(message.consumerId);
    if (message.epoch !== this.epoch || consumer?.kind !== 'frames' || !consumer.active || consumer.busy
      || message.generation < this.statusValue.streamGeneration || this.abort.signal.aborted
      || Date.now() - message.frame.captureTimeMs > this.settings.maximumFrameAgeMs) { ack(); return; }
    if (message.frame.data.byteLength > this.settings.maximumFrameBytes) { ack(); return; }
    this.update({ streamGeneration: message.generation, decoder: 'ready' });
    clearTimeout(consumer.timer);
    consumer.busy = true;
    const frame = { ...message.frame, data: Buffer.from(message.frame.data), frameNumber: consumer.frameNumber++ };
    void deadline(Promise.resolve().then(() => {
      if (consumer.active && !this.abort.signal.aborted && message.epoch === this.epoch) {
        const result = consumer.options.onFrame(frame);
        consumer.ready.resolve();
        return result;
      }
    }), this.settings.callbackTimeoutMs, 'Frame callback timed out.').catch(error => {
      void this.stopConsumer(consumer, asError(error)).catch(() => undefined);
    }).finally(() => { consumer.busy = false; ack(); });
  }
  private message(message: WorkerMessage): void {
    if (message.epoch !== this.epoch) return;
    if (message.kind === 'status') {
      this.update({ ...message.status,
        // Control and JPEG ports are independent; a delayed status must not reopen
        // acceptance of an older stream generation after a newer JPEG arrived.
        streamGeneration: Math.max(this.statusValue.streamGeneration, message.status.streamGeneration),
        reconciliationNeeded: this.statusValue.reconciliationNeeded || message.status.reconciliationNeeded,
      });
      this.host?.send({ kind: 'status-ack', epoch: this.epoch });
    } else if (message.kind === 'consumer-error') {
      const consumer = this.consumers.get(message.consumerId);
      if (consumer !== undefined) void this.stopConsumer(consumer, deserializeError(message.error)).catch(() => undefined);
    } else if (message.kind === 'progress') {
      const consumer = this.consumers.get(message.consumerId);
      if (consumer?.kind === 'record' && consumer.active) {
        try { consumer.options.onProgress?.(); } catch (error) { this.report(consumer, asError(error)); }
      }
    } else if (message.kind === 'event') {
      const host = this.host;
      const consumer = this.consumers.get(message.consumerId);
      const ack = (failed: boolean): void => host?.send({ kind: 'event-ack', epoch: message.epoch, sequence: message.sequence, failed });
      if (consumer?.kind !== 'record') { this.update({ reconciliationNeeded: true }); ack(true); return; }
      // Event count is bounded by worker credits; callbacks preserve publication order.
      consumer.events = consumer.events.then(async () => {
        if (consumer.deliveryFailed) { ack(true); return; }
        try {
          await deadline(Promise.resolve().then(() => message.event.type === 'committed'
            ? consumer.options.onCommitted(message.event.segment)
            : consumer.options.onSessionClosed?.(message.event.cameraId, message.event.sessionStartMs)),
          this.settings.callbackTimeoutMs, 'Recording notification callback timed out.');
          ack(false);
        } catch (error) {
          // A timed-out callback cannot be canceled. Stop further notifications so
          // unresolved application promises cannot accumulate indefinitely.
          consumer.deliveryFailed = true;
          this.update({ reconciliationNeeded: true, lastError: asError(error) });
          this.report(consumer, asError(error));
          ack(true);
        }
      });
    }
  }
  private assertOpen(): void {
    this.abort.signal.throwIfAborted();
    if (this.terminalError !== undefined) throw this.terminalError;
  }
  private assertActive(consumer: Consumer): void {
    this.assertOpen();
    if (!consumer.active) throw failure('ECLOSED', 'Camera consumer is stopped.');
  }
  private report(consumer: Consumer, error: Error): void {
    try { void Promise.resolve(consumer.options.onError(error)).catch(() => undefined); } catch { /* User callbacks cannot break ownership. */ }
  }
  private update(change: Partial<CameraStatus>): void {
    this.statusValue = { ...this.statusValue, ...change };
    for (const listener of this.listeners) {
      try { listener(this.status); } catch { /* Status observation is isolated from lifecycle. */ }
    }
  }
}
