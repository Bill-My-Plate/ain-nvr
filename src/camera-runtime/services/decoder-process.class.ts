import { fork, type ChildProcess } from 'node:child_process';
import {
  decoderCandidates,
  detectDecoderHostCapabilities,
  type ExtractedJpegFrame,
} from '../../frame-extractor/index.js';
import { privateEntry } from '../utils/private-entry.util.js';
import { asError } from '../../shared/index.js';
import { deadline } from '../utils/deadline.util.js';
import { deferred } from '../utils/deferred.util.js';
import { deserializeError } from '../utils/deserialize-error.util.js';
import { failure } from '../../camera/index.js';
import { type FrameProfile } from '../../camera/index.js';
import { type RuntimeSettings } from '../types/runtime-settings.type.js';
import type { DecoderCommand } from '../types/decoder-command.type.js';
import type { DecoderMessage } from '../types/decoder-message.type.js';
/**
 * Starts and stops the separate frame decoder process for a camera profile.
 */
export class DecoderProcess {
  private child: ChildProcess | undefined;
  private readonly exited = deferred<void>();
  private readonly ready = deferred<void>();
  private retryFrameTimer: NodeJS.Timeout | undefined;
  private stopping: Promise<void> | undefined;
  private closing = false;
  private failed = false;
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(
    private readonly settings: RuntimeSettings,
    private readonly onFrame: (frame: ExtractedJpegFrame) => void,
    private readonly onError: (error: Error) => void,
  ) {}

  /**
   * Starts the decoder and waits for it to initialize.
   */
  public async start(url: string, cameraId: string, profile: FrameProfile): Promise<void> {
    const capabilities = detectDecoderHostCapabilities();
    this.launch({
      type: 'start',
      url,
      cameraId,
      profile,
      maximumFrameBytes: this.settings.maximumFrameBytes,
      softwareOnly: !decoderCandidates(capabilities).some((candidate) => candidate.hardwareDevice !== undefined),
    });
    try {
      await deadline(
        this.ready.promise,
        this.settings.operationTimeoutMs,
        'Decoder initialization timed out.',
      );
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  /** Launches one child. The RTSP bridge and frame subscribers survive a CPU retry. */
  private launch(command: Extract<DecoderCommand, { type: 'start' }>): void {
    const canRetryOnCpu = process.platform === 'linux' && !command.softwareOnly;
    let decoderError: Error | undefined;
    const child = fork(privateEntry('decoder-process-entry'), [], {
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [],
      env: { ...process.env, NODE_OPTIONS: '' },
    });
    this.child = child;
    child.once('error', (error) => {
      if (child.pid === undefined) {
        this.child = undefined;
        this.exited.resolve();
      }
      this.fail(error);
    });
    child.once('exit', (code, signal) => {
      this.child = undefined;
      if (!this.closing && canRetryOnCpu) {
        try {
          // A native crash or linker failure can exit without sending an IPC error.
          // The controller's original first-frame timer may already have cleared.
          this.retryFrameTimer = setTimeout(() => {
            this.fail(failure('ETIMEDOUT', 'CPU decoder produced no JPEG before its deadline.'));
          }, this.settings.firstFrameTimeoutMs);
          this.launch({ ...command, softwareOnly: true });
          return;
        } catch (error) {
          decoderError = asError(error);
        }
      }
      this.exited.resolve();
      if (!this.closing)
        this.fail(decoderError ?? failure('decoder_exited', `Decoder process exited (${signal ?? code}).`));
    });
    child.on('message', (message: DecoderMessage) => {
      if (this.closing || this.child !== child || decoderError !== undefined) return;
      if (message.type === 'ready') this.ready.resolve();
      else if (message.type === 'error') {
        decoderError = deserializeError(message.error);
        // Native reads can block shutdown. Reap the failed child before relaunching.
        if (canRetryOnCpu) child.kill('SIGKILL');
        else this.fail(decoderError);
      } else if (message.type === 'frame') {
        try {
          if (message.frame.data.byteLength > this.settings.maximumFrameBytes)
            throw new Error('Oversized decoder frame.');
          clearTimeout(this.retryFrameTimer);
          this.retryFrameTimer = undefined;
          this.onFrame({ ...message.frame, data: Buffer.from(message.frame.data) });
          this.send({ type: 'ack' });
        } catch (error) {
          this.fail(asError(error));
        }
      }
    });
    this.send(command);
  }

  /**
   * Stops active work and releases owned resources.
   */
  public stop(): Promise<void> {
    if (this.stopping !== undefined) return this.stopping;
    this.closing = true;
    clearTimeout(this.retryFrameTimer);
    this.retryFrameTimer = undefined;
    this.ready.reject(new Error('Decoder stopped.'));
    this.stopping = (async () => {
      const child = this.child;
      if (child === undefined) return;
      this.send({ type: 'stop' });
      try {
        await deadline(
          this.exited.promise,
          this.settings.shutdownTimeoutMs,
          'Decoder shutdown timed out.',
        );
      } catch {
        child.kill('SIGKILL');
        await this.exited.promise;
      }
    })();
    return this.stopping;
  }
  /**
   * Sends a command to the active child. Its exit handler owns crash recovery.
   */
  private send(message: DecoderCommand): void {
    const child = this.child;
    if (!child?.connected) return;
    const onSendError = (error: Error | null): void => {
      if (!error || this.closing || this.child !== child) return;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EPIPE' && code !== 'ERR_IPC_CHANNEL_CLOSED' && code !== 'ERR_IPC_DISCONNECTED')
        this.fail(error);
    };
    try {
      child.send(message, onSendError);
    } catch (error) {
      onSendError(asError(error));
    }
  }
  /**
   * Reports a terminal failure once and stops the active child.
   */
  private fail(error: Error): void {
    if (this.failed || this.closing) return;
    this.failed = true;
    this.ready.reject(error);
    void this.stop().catch(() => undefined);
    this.onError(error);
  }
}
