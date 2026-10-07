import { RecordingPipeline } from '../../recording-parser/index.js';
import { RecordingSegmentWriter } from '../../recording-storage/index.js';
import type { PacketLocation } from '../../recording-storage/index.js';
import type { RtspSessionSnapshot, RtspStreamSession } from '../../stream-session/index.js';
import { GenerationSource } from './generation-source.class.js';
import { asError } from '../utils/as-error.util.js';

import type { RecorderOptions } from '../types/recorder-options.type.js';

export class CameraRecorder {
  private writer: RecordingSegmentWriter | undefined;
  private pipeline: RecordingPipeline<PacketLocation> | undefined;
  private source: GenerationSource | undefined;
  private transition: Promise<void> = Promise.resolve();
  private rotation: NodeJS.Timeout | undefined;
  private unsubscribe: (() => void) | undefined;
  private generation = 0;
  private stopped = false;
  private error: Error | undefined;
  private stopping: Promise<void> | undefined;

  constructor(private readonly session: RtspStreamSession, private readonly options: RecorderOptions) {}
  get queuedBytes(): number { return this.pipeline?.status.queuedBytes ?? 0; }

  async start(): Promise<void> {
    this.unsubscribe = this.session.subscribeSessionChanges(snapshot => this.select(snapshot));
    if (this.session.snapshot === undefined) throw new Error('No negotiated camera session.');
    this.select(this.session.snapshot);
    await this.transition;
    if (this.error !== undefined) throw this.error;
  }
  requestBoundary(): void { this.pipeline?.requestBoundary(); }
  stop(): Promise<void> {
    if (this.stopping !== undefined) return this.stopping;
    this.stopped = true;
    this.unsubscribe?.();
    this.source?.close();
    this.stopping = this.transition.then(() => this.drain());
    return this.stopping;
  }
  private select(snapshot: RtspSessionSnapshot): void {
    if (this.stopped || this.generation === snapshot.generation) return;
    this.generation = snapshot.generation;
    this.source?.close();
    const source = new GenerationSource(this.session, snapshot.generation, error => this.fail(error));
    this.source = source;
    this.transition = this.transition.then(async () => {
      await this.drain();
      if (this.stopped || this.generation !== snapshot.generation) return;
      const writer = await RecordingSegmentWriter.create({
        ...this.options,
        sessionStartMs: Date.now(),
        sessionInfo: snapshot.sessionInfo,
        onConfigurationChanged: () => this.requestBoundary(),
      });
      if (this.stopped || this.generation !== snapshot.generation) {
        await writer.close(false);
        return;
      }
      this.writer = writer;
      this.pipeline = new RecordingPipeline({
        tracks: snapshot.sessionInfo.tracks,
        source, writer, decoderSafeBoundaries: true,
        ...(this.options.playpointIntervalMs === undefined ? {} : { playpointIntervalMs: this.options.playpointIntervalMs }),
        onIndexEvents: async events => {
          await writer.applyEvents(events);
          if (events.some(event => event.type === 'packet')) this.options.onProgress();
        },
        onBatchComplete: () => writer.completeBatch(),
        onError: error => this.fail(error),
      });
      this.pipeline.start();
      this.rotation = setInterval(() => this.requestBoundary(), this.options.segmentDurationMs);
      this.rotation.unref();
    }).catch(error => this.fail(asError(error)));
  }
  private fail(error: Error): void {
    if (this.error !== undefined) return;
    this.error = error;
    this.options.onError(error);
    // Do not wait for a pipeline/transition from its own callback.
    void this.stop().catch(error => this.options.onError(asError(error)));
  }
  private async drain(): Promise<void> {
    clearInterval(this.rotation);
    this.rotation = undefined;
    const pipeline = this.pipeline;
    const writer = this.writer;
    this.pipeline = undefined;
    this.writer = undefined;
    await pipeline?.stop();
    await writer?.close(this.error === undefined && pipeline?.status.state !== 'failed');
    if (pipeline?.status.state === 'failed') throw pipeline.status.lastError;
  }
}
