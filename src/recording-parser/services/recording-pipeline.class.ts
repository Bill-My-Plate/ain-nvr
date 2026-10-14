import type { MediaPacket } from '../../media/index.js';
import { RecordingParser } from './recording-parser.class.js';
import { RecordingPacketQueue } from './recording-packet-queue.class.js';

import type { RecordingPipelineState } from '../types/recording-pipeline-state.type.js';
import type { RecordingPipelineOptions } from '../types/recording-pipeline-options.interface.js';
import type { RecordingPipelineStatus } from '../types/recording-pipeline-status.interface.js';
/**
 * Serializes packet writes and applies bounded socket backpressure. It does not choose
 * file names, write metadata, move cache files, or delete recordings.
 */
export class RecordingPipeline<TLocation> {
  private readonly parser: RecordingParser<TLocation>;
  private readonly queue: RecordingPacketQueue;
  private stateValue: RecordingPipelineState = 'idle';
  private writtenPackets = 0;
  private stopping = false;
  private unsubscribe: (() => void) | undefined;
  private runPromise: Promise<void> | undefined;
  private lastError: Error | undefined;
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(private readonly options: RecordingPipelineOptions<TLocation>) {
    this.queue = new RecordingPacketQueue(options.source, options);
    this.parser = new RecordingParser<TLocation>(options);
  }

  /**
   * Returns a snapshot of the current status.
   */
  public get status(): RecordingPipelineStatus {
    return {
      state: this.stateValue,
      queuedBytes: this.queue.queuedBytes,
      queuedPackets: this.queue.queuedPackets,
      writtenPackets: this.writtenPackets,
      ...(this.lastError === undefined ? {} : { lastError: this.lastError }),
    };
  }

  /**
   * Starts the operation and initializes its resources.
   */
  public start(): void {
    if (this.stateValue !== 'idle') throw new Error('Recording pipeline can only be started once.');
    this.stateValue = 'running';
    this.unsubscribe = this.options.source.subscribeMediaPackets((packet) => this.enqueue(packet));
    this.runPromise = this.run().catch((error: unknown) => {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    });
  }

  /**
   * Request Boundary.
   */
  public requestBoundary(): void {
    this.parser.requestBoundary();
  }

  /**
   * Stops active work and releases owned resources.
   */
  public async stop(): Promise<void> {
    if (this.stateValue === 'idle') {
      this.stateValue = 'stopped';
      return;
    }
    if (this.stateValue === 'stopped') return;
    this.stopping = true;
    if (this.stateValue !== 'failed') this.stateValue = 'stopping';
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.queue.wake();
    await this.runPromise;
    this.queue.resumeSource();
    if (this.stateValue !== 'failed') this.stateValue = 'stopped';
  }

  /**
   * Enqueue.
   */
  private enqueue(packet: MediaPacket): void {
    if (this.stateValue !== 'running') return;
    const overflow = this.queue.push(packet);
    if (overflow !== undefined) this.fail(overflow);
  }

  /**
   * Runs the operation until completion or cancellation.
   */
  private async run(): Promise<void> {
    while (!this.stopping || this.queue.queuedPackets > 0) {
      const packet = this.queue.shift();
      if (packet === undefined) {
        await this.queue.wait();
        continue;
      }
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

  /**
   * Fail.
   */
  private fail(error: Error): void {
    if (this.stateValue === 'failed' || this.stateValue === 'stopped') return;
    this.lastError = error;
    this.stateValue = 'failed';
    this.stopping = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.queue.clear();
    this.options.onError?.(error);
  }
}
