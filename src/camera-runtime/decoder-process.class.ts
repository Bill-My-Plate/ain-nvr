import { fork, type ChildProcess } from 'node:child_process';
import type { ExtractedJpegFrame } from '../frame-extractor/index.js';
import { privateEntry } from './private-entry.util.js';
import { asError } from './as-error.util.js';
import { deadline } from './deadline.util.js';
import { deferred } from './deferred.util.js';
import { deserializeError } from './deserialize-error.util.js';
import { failure } from './failure.util.js';
import { type FrameProfile } from './frame-profile.type.js';
import { type RuntimeSettings } from './runtime-settings.type.js';
import type { DecoderCommand } from './decoder-command.type.js';
import type { DecoderMessage } from './decoder-message.type.js';

export class DecoderProcess {
  private child: ChildProcess | undefined;
  private readonly exited = deferred<void>();
  private readonly ready = deferred<void>();
  private stopping: Promise<void> | undefined;
  private closing = false;
  private failed = false;

  constructor(
    private readonly settings: RuntimeSettings,
    private readonly onFrame: (frame: ExtractedJpegFrame) => void,
    private readonly onError: (error: Error) => void,
  ) {}

  async start(url: string, cameraId: string, profile: FrameProfile): Promise<void> {
    const child = fork(privateEntry('decoder-process-entry'), [], {
      serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [], env: { ...process.env, NODE_OPTIONS: '' },
    });
    this.child = child;
    child.on('error', error => { this.fail(error); if (child.pid === undefined) this.exited.resolve(); });
    child.on('exit', (code, signal) => {
      this.exited.resolve();
      if (!this.closing) this.fail(failure('decoder_exited', `Decoder process exited (${signal ?? code}).`));
    });
    child.on('message', (message: DecoderMessage) => {
      if (this.closing) return;
      if (message.type === 'ready') this.ready.resolve();
      else if (message.type === 'error') this.fail(deserializeError(message.error));
      else if (message.type === 'frame') {
        try {
          if (message.frame.data.byteLength > this.settings.maximumFrameBytes) throw new Error('Oversized decoder frame.');
          this.onFrame({ ...message.frame, data: Buffer.from(message.frame.data) });
          this.send({ type: 'ack' });
        } catch (error) { this.fail(asError(error)); }
      }
    });
    this.send({ type: 'start', url, cameraId, profile, maximumFrameBytes: this.settings.maximumFrameBytes });
    await deadline(this.ready.promise, this.settings.operationTimeoutMs, 'Decoder initialization timed out.');
  }

  stop(): Promise<void> {
    if (this.stopping !== undefined) return this.stopping;
    this.closing = true;
    this.ready.reject(new Error('Decoder stopped.'));
    this.stopping = (async () => {
      if (this.child === undefined) return;
      this.send({ type: 'stop' });
      try {
        await deadline(this.exited.promise, this.settings.shutdownTimeoutMs, 'Decoder shutdown timed out.');
      } catch {
        this.child.kill('SIGKILL');
        await this.exited.promise;
      }
    })();
    return this.stopping;
  }
  private send(message: DecoderCommand): void {
    if (!this.child?.connected) return;
    try { this.child.send(message, error => { if (error && !this.closing) this.fail(error); }); }
    catch (error) { if (!this.closing) this.fail(asError(error)); }
  }
  private fail(error: Error): void {
    if (this.failed || this.closing) return;
    this.failed = true;
    this.ready.reject(error);
    this.onError(error);
    void this.stop().catch(() => undefined);
  }
}
