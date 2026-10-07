import { MessageChannel, Worker, type MessagePort } from 'node:worker_threads';
import { privateEntry } from '../utils/private-entry.util.js';
import { PROTOCOL_VERSION } from '../constants/protocol-version.constant.js';
import { asError } from '../utils/as-error.util.js';
import { deadline } from '../utils/deadline.util.js';
import { deferred } from '../utils/deferred.util.js';
import { deserializeError } from '../utils/deserialize-error.util.js';
import { failure } from '../utils/failure.util.js';
import { type Command } from '../types/command.type.js';
import { type FrameAck } from '../types/frame-ack.type.js';
import { type FrameMessage } from '../types/frame-message.type.js';
import { type HostMessage } from '../types/host-message.type.js';
import { type RuntimeSettings } from '../types/runtime-settings.type.js';
import { type WorkerMessage } from '../types/worker-message.type.js';

/** One incarnation; never creates its replacement before exit is confirmed. */
export class CameraWorkerHost {
  private readonly worker: Worker;
  private readonly frames: MessagePort;
  private readonly ready = deferred<void>();
  private readonly exited = deferred<void>();
  private readonly requests = new Map<number, ReturnType<typeof deferred<void>>>();
  private requestId = 0;
  private dead = false;
  private failed = false;
  private closing: Promise<void> | undefined;

  constructor(
    cameraId: string,
    url: string,
    readonly epoch: number,
    private readonly settings: RuntimeSettings,
    onMessage: (message: WorkerMessage) => void,
    onFrame: (message: FrameMessage) => void,
    private readonly onFailure: (error: Error, terminal: boolean) => void,
  ) {
    const { port1, port2 } = new MessageChannel();
    this.frames = port1;
    try {
      this.worker = new Worker(privateEntry('camera-worker-entry'), {
        workerData: { cameraId, url, epoch, settings, framePort: port2 },
        transferList: [port2], execArgv: [], env: { ...process.env, NODE_OPTIONS: '' },
      });
    } catch (error) { port1.close(); port2.close(); throw error; }
    port1.on('message', (message: FrameMessage) => { if (message.epoch === epoch) onFrame(message); });
    port1.on('messageerror', error => this.fail(asError(error), false));
    // Bun requires explicit startup for transferred MessageChannel traffic.
    port1.start();
    this.worker.on('messageerror', error => this.fail(asError(error), false));
    this.worker.on('error', error => this.fail(error, false));
    this.worker.on('exit', code => {
      this.dead = true;
      this.frames.close();
      this.exited.resolve();
      if (this.closing === undefined) this.fail(failure('worker_exited', `Camera worker exited unexpectedly (${code}).`), false);
      else {
        // A failed startup may close its port before acknowledging our close request.
        // Settle it on exit instead of keeping callers until the operation deadline.
        for (const pending of this.requests.values()) pending.reject(failure('worker_exited', 'Camera worker exited before acknowledging shutdown.'));
      }
    });
    this.worker.on('message', (message: WorkerMessage) => {
      if (message.epoch !== epoch) return;
      if (message.kind === 'ready') {
        if (message.version !== PROTOCOL_VERSION) this.fail(failure('EPROTO', 'Incompatible camera worker protocol.'), true);
        else this.ready.resolve();
      } else if (message.kind === 'response') {
        const pending = this.requests.get(message.id);
        if (message.error === undefined) pending?.resolve();
        else pending?.reject(deserializeError(message.error));
      } else if (message.kind === 'fatal') this.fail(deserializeError(message.error), message.terminal);
      else onMessage(message);
    });
  }
  async start(): Promise<void> {
    try { await deadline(this.ready.promise, this.settings.acquireTimeoutMs, 'Camera negotiation timed out.'); }
    catch (error) { this.fail(asError(error), false); throw error; }
  }
  async request(command: Command, timeout = this.settings.operationTimeoutMs): Promise<void> {
    if (this.dead || (this.closing !== undefined && command.type !== 'close')) throw failure('ECLOSED', 'Camera worker is closed.');
    if (this.requests.size >= 64) throw failure('EBUSY', 'Too many pending camera commands.');
    const id = ++this.requestId;
    const request = deferred<void>();
    this.requests.set(id, request);
    try {
      this.send({ kind: 'request', epoch: this.epoch, id, command });
      await deadline(request.promise, timeout, `Camera ${command.type} operation timed out.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ETIMEDOUT' && command.type !== 'close') this.fail(asError(error), false);
      throw error;
    } finally { this.requests.delete(id); }
  }
  acknowledgeFrame(ack: FrameAck): void {
    if (!this.dead) this.frames.postMessage(ack);
  }
  send(message: HostMessage): void {
    if (this.dead) return;
    try { this.worker.postMessage(message); }
    catch (error) { this.fail(asError(error), false); }
  }
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    this.closing = Promise.resolve().then(async () => {
      const closed = failure('ECLOSED', 'Camera worker is closing.');
      this.ready.reject(closed);
      for (const pending of this.requests.values()) pending.reject(closed);
      if (this.dead) return;
      let error: unknown;
      try {
        await this.request({ type: 'close' }, this.settings.shutdownTimeoutMs);
      } catch (cause) { error = cause; }
      finally {
        // The close response confirms recorder, decoder and socket cleanup.
        // Explicitly end the thread: closing parentPort alone can keep Bun alive.
        if (!this.dead) await this.worker.terminate();
        await this.exited.promise;
        this.frames.close();
      }
      if (error !== undefined) throw error;
    });
    return this.closing;
  }
  private fail(error: Error, terminal: boolean): void {
    if (this.failed || this.closing !== undefined) return;
    this.failed = true;
    this.ready.reject(error);
    for (const pending of this.requests.values()) pending.reject(error);
    this.onFailure(error, terminal);
  }
}
