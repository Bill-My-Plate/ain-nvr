import { CameraRecorder, failure } from '../../camera/index.js';
import type { RtspStreamSession } from '../../stream-session/index.js';
import { serializeError } from '../utils/serialize-error.util.js';
import type { Command } from '../types/command.type.js';
import type { RecordingEvent } from '../types/recording-event.type.js';
import type { RuntimeSettings } from '../types/runtime-settings.type.js';
import type { WorkerMessage } from '../types/worker-message.type.js';

/** Owns the worker's single recorder, progress signal, and bounded recording events. */
export class CameraRecordingController {
  private readonly events = new Set<number>();
  private recorder: { id: string; value: CameraRecorder } | undefined;
  private progressPending = false;
  private needsReconciliation = false;
  private sequence = 0;

  /** Captures the session and callbacks used to report recording outcomes. */
  public constructor(
    private readonly session: RtspStreamSession,
    private readonly cameraId: string,
    private readonly epoch: number,
    private readonly settings: RuntimeSettings,
    private readonly send: (message: WorkerMessage) => void,
    private readonly onStatusChange: () => void,
  ) {}

  /** Whether one recording consumer owns the recorder. */
  public get active(): boolean {
    return this.recorder !== undefined;
  }

  /** Bytes queued by the current recorder, if any. */
  public get queuedBytes(): number {
    return this.recorder?.value.queuedBytes ?? 0;
  }

  /** Whether a lost event or writer failure requires a storage scan. */
  public get reconciliationNeeded(): boolean {
    return this.needsReconciliation;
  }

  /** Releases one event slot after its host acknowledgement. */
  public acknowledgeEvent(sequence: number, failed: boolean): void {
    this.events.delete(sequence);
    if (failed) this.needsReconciliation = true;
  }

  /** Starts the only recorder and clears ownership if startup fails. */
  public async start(consumerId: string, options: Extract<Command, { type: 'record' }>['options']): Promise<void> {
    if (this.recorder !== undefined)
      throw failure('EEXIST', 'Camera already has a recording owner.');
    const recorder = new CameraRecorder(this.session, {
      ...options,
      cameraId: this.cameraId,
      onCommitted: (segment) =>
        this.recordingEvent(consumerId, { type: 'committed', segment }),
      onSessionClosed: (cameraId, sessionStartMs) =>
        this.recordingEvent(consumerId, {
          type: 'session-closed',
          cameraId,
          sessionStartMs,
        }),
      onError: (error) => {
        this.needsReconciliation = true;
        this.send({
          kind: 'consumer-error',
          epoch: this.epoch,
          consumerId,
          error: serializeError(error),
        });
      },
      onProgress: () => {
        this.progressPending = true;
      },
    });
    this.recorder = { id: consumerId, value: recorder };
    try {
      await recorder.start();
    } catch (error) {
      await recorder.stop().catch(() => undefined);
      this.recorder = undefined;
      throw error;
    }
  }

  /** Requests a segment boundary for the active recording consumer. */
  public boundary(consumerId: string): void {
    if (this.recorder?.id !== consumerId)
      throw failure('ENOENT', 'Recording is no longer active.');
    this.recorder.value.requestBoundary();
  }

  /** Stops the matching consumer and releases recording ownership. */
  public async stop(consumerId: string): Promise<void> {
    if (this.recorder?.id !== consumerId) return;
    const recorder = this.recorder;
    try {
      await recorder.value.stop();
    } finally {
      this.recorder = undefined;
    }
  }

  /** Flushes a pending progress notice when no status update is awaiting acknowledgement. */
  public publishProgress(statusPending: boolean): void {
    if (!this.progressPending || this.recorder === undefined || statusPending) return;
    this.send({ kind: 'progress', epoch: this.epoch, consumerId: this.recorder.id });
    this.progressPending = false;
  }

  /** Drains the recorder during engine shutdown; ownership clears after session stop. */
  public close(): Promise<void> | undefined {
    return this.recorder?.value.stop();
  }

  /** Clears the recorder after the parent session has stopped. */
  public finishClose(): void {
    this.recorder = undefined;
  }

  /** Sends a bounded recording event or marks storage reconciliation necessary. */
  private recordingEvent(consumerId: string, event: RecordingEvent): void {
    if (this.events.size >= this.settings.maximumPendingEvents) {
      this.needsReconciliation = true;
      this.onStatusChange();
      return;
    }
    const sequence = ++this.sequence;
    this.events.add(sequence);
    this.send({ kind: 'event', epoch: this.epoch, sequence, consumerId, event });
  }
}
