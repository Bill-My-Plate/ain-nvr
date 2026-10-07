import type { MediaPacket } from '../media/index.js';
import { RecordingParser } from './recording-parser.class.js';

import type { RecordingPipelineState } from './recording-pipeline-state.type.js';
import type { RecordingPipelineOptions } from './recording-pipeline-options.interface.js';
import type { RecordingPipelineStatus } from './recording-pipeline-status.interface.js';
import { positiveInteger } from './positive-integer.util.js';

/**
 * Serializes packet writes and applies bounded socket backpressure. It does not choose
 * file names, write metadata, move cache files, or delete recordings.
 */
export class RecordingPipeline<TLocation> {
  private readonly parser: RecordingParser<TLocation>;
  private readonly pauseAtBytes: number;
  private readonly resumeAtBytes: number;
  private readonly maximumQueuedBytes: number;
  private readonly maximumQueuedPackets: number;
  private readonly queue: MediaPacket[] = [];
  private stateValue: RecordingPipelineState = 'idle';
  private queuedBytes = 0;
  private writtenPackets = 0;
  private paused = false;
  private stopping = false;
  private unsubscribe: (() => void) | undefined;
  private wake: (() => void) | undefined;
  private runPromise: Promise<void> | undefined;
  private lastError: Error | undefined;

  constructor(private readonly options: RecordingPipelineOptions<TLocation>) {
    this.pauseAtBytes = positiveInteger(options.pauseAtBytes, 8 * 1024 * 1024, 'pauseAtBytes');
    this.resumeAtBytes = positiveInteger(options.resumeAtBytes, 4 * 1024 * 1024, 'resumeAtBytes');
    this.maximumQueuedBytes = positiveInteger(
      options.maximumQueuedBytes,
      16 * 1024 * 1024,
      'maximumQueuedBytes',
    );
    this.maximumQueuedPackets = positiveInteger(
      options.maximumQueuedPackets,
      4_096,
      'maximumQueuedPackets',
    );
    if (this.resumeAtBytes >= this.pauseAtBytes) {
      throw new RangeError('resumeAtBytes must be smaller than pauseAtBytes.');
    }
    if (this.pauseAtBytes >= this.maximumQueuedBytes) {
      throw new RangeError('pauseAtBytes must be smaller than maximumQueuedBytes.');
    }
    this.parser = new RecordingParser<TLocation>(options);
  }

  get status(): RecordingPipelineStatus {
    return {
      state: this.stateValue,
      queuedBytes: this.queuedBytes,
      queuedPackets: this.queue.length,
      writtenPackets: this.writtenPackets,
      ...(this.lastError === undefined ? {} : { lastError: this.lastError }),
    };
  }

  start(): void {
    if (this.stateValue !== 'idle') throw new Error('Recording pipeline can only be started once.');
    this.stateValue = 'running';
    this.unsubscribe = this.options.source.subscribeMediaPackets((packet) => this.enqueue(packet));
    this.runPromise = this.run().catch((error: unknown) => {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    });
  }

  requestBoundary(): void {
    this.parser.requestBoundary();
  }

  async stop(): Promise<void> {
    if (this.stateValue === 'idle') {
      this.stateValue = 'stopped';
      return;
    }
    if (this.stateValue === 'stopped') return;
    this.stopping = true;
    if (this.stateValue !== 'failed') this.stateValue = 'stopping';
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.wake?.();
    await this.runPromise;
    this.resumeSource();
    if (this.stateValue !== 'failed') this.stateValue = 'stopped';
  }

  private enqueue(packet: MediaPacket): void {
    if (this.stateValue !== 'running') return;
    this.queue.push(packet);
    this.queuedBytes += packet.rawInterleavedFrame.length;
    if (this.queuedBytes >= this.maximumQueuedBytes
      || this.queue.length >= this.maximumQueuedPackets) {
      this.fail(new Error(
        `Recording queue exceeded ${this.maximumQueuedBytes} bytes or `
        + `${this.maximumQueuedPackets} packets.`,
      ));
      return;
    }
    if (!this.paused && this.queuedBytes >= this.pauseAtBytes) {
      this.paused = true;
      this.options.source.pauseMedia();
    }
    this.wake?.();
    this.wake = undefined;
  }

  private async run(): Promise<void> {
    while (!this.stopping || this.queue.length > 0) {
      const packet = this.queue.shift();
      if (packet === undefined) {
        await new Promise<void>((resolve) => { this.wake = resolve; });
        continue;
      }
      this.queuedBytes -= packet.rawInterleavedFrame.length;
      if (this.paused && this.queuedBytes <= this.resumeAtBytes) this.resumeSource();
      const events = await this.parser.process(packet, this.options.writer);
      this.writtenPackets += 1;
      if (events.length > 0) await this.options.onIndexEvents?.(events);
      if (this.status.state !== 'failed') await this.options.onBatchComplete?.();
    }
    if (this.stateValue !== 'failed') {
      const events = await this.parser.flush(this.options.writer);
      if (events.length > 0) await this.options.onIndexEvents?.(events);
      if (this.status.state !== 'failed') await this.options.onBatchComplete?.();
    }
  }

  private fail(error: Error): void {
    if (this.stateValue === 'failed' || this.stateValue === 'stopped') return;
    this.lastError = error;
    this.stateValue = 'failed';
    this.stopping = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.queue.length = 0;
    this.queuedBytes = 0;
    this.resumeSource();
    this.wake?.();
    this.wake = undefined;
    this.options.onError?.(error);
  }

  private resumeSource(): void {
    if (!this.paused) return;
    this.paused = false;
    this.options.source.resumeMedia();
  }
}
