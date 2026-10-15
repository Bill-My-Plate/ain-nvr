import { RECORDING_STORAGE_CONSTANTS } from '../constants/recording-storage-numeric-values.constant.js';
import {
  type RecordingIndexEvent,
  type RecordingPacketWriter,
  type RecordingWriteRequest,
} from '../../recording-parser/index.js';
import type { ActiveRecordingSegment } from '../types/active-recording-segment.type.js';
import type { PacketLocation } from '../types/packet-location.type.js';
import type { RecordingSegmentWriterOptions } from '../types/recording-segment-writer-options.type.js';
import { applyRecordingIndexEvent } from '../utils/apply-recording-index-event.util.js';
import { RecordingSegmentFileManager } from './recording-segment-file-manager.class.js';
import { RecordingSegmentWriterUtil } from './recording-segment-writer-util.class.js';
import { RecordingSessionManager } from './recording-session-manager.class.js';

/** Coordinates packet writes, index batches, session rotation, and shutdown. */
export class RecordingSegmentWriter implements RecordingPacketWriter<PacketLocation> {
  private readonly session: RecordingSessionManager;
  private readonly files: RecordingSegmentFileManager;
  private active: ActiveRecordingSegment | undefined;
  private closed = false;
  private closePromise: Promise<void> | undefined;
  private readonly pendingFinalization: ActiveRecordingSegment[] = [];
  private pendingClosedSessions: number[] = [];

  /** Validates writer settings and creates the private session and file managers. */
  private constructor(private readonly options: RecordingSegmentWriterOptions) {
    const playpointIntervalMs = RecordingSegmentWriterUtil.positiveInteger(
      options.playpointIntervalMs ?? RECORDING_STORAGE_CONSTANTS.defaultPlaypointIntervalMs,
      'playpointIntervalMs',
    );
    const minimumFreeBytes = RecordingSegmentWriterUtil.positiveInteger(
      options.minimumFreeBytes ?? RECORDING_STORAGE_CONSTANTS.defaultMinimumFreeBytes,
      'minimumFreeBytes',
    );
    RecordingSegmentWriterUtil.positiveInteger(options.segmentDurationMs, 'segmentDurationMs');
    this.session = new RecordingSessionManager(options, playpointIntervalMs);
    this.files = new RecordingSegmentFileManager(
      options,
      this.session,
      playpointIntervalMs,
      minimumFreeBytes,
    );
  }

  /** Creates a writer after reserving and publishing its initial session metadata. */
  public static async create(
    options: RecordingSegmentWriterOptions,
  ): Promise<RecordingSegmentWriter> {
    const writer = new RecordingSegmentWriter(options);
    await writer.session.initialize();
    return writer;
  }

  /** Appends one framed packet, rotating only when the parser requests a boundary. */
  public async write(request: RecordingWriteRequest): Promise<PacketLocation> {
    if (this.closed) throw new Error('Recording writer is closed.');
    await this.files.checkDiskSpace(request.packet.arrivalTimeMs);

    if (request.boundaryBefore && this.active !== undefined) {
      const completed = this.active;
      const closedSessionStartMs = this.session.startMs;
      this.active = undefined;
      this.pendingFinalization.push(completed);
      if (this.session.hasPendingConfiguration) {
        await this.session.beginConfigurationSession(request.packet.arrivalTimeMs);
        this.pendingClosedSessions.push(closedSessionStartMs);
      }
    }

    const active =
      this.active ??
      (await this.files.openSegment(request.packet.arrivalTimeMs, request.discontinuityBefore));
    this.active = active;
    return this.files.writePacket(active, request);
  }

  /** Applies parser index events before any pending segment is published. */
  public async applyEvents(events: readonly RecordingIndexEvent<PacketLocation>[]): Promise<void> {
    for (const event of events) {
      if (event.type === 'configuration') {
        await this.session.updateConfiguration(event.trackId, event.configuration);
      } else {
        applyRecordingIndexEvent(event);
      }
    }
  }

  /** Publishes completed segments and then reports any closed codec sessions. */
  public async completeBatch(): Promise<void> {
    while (this.pendingFinalization.length > 0) {
      const segment = this.pendingFinalization[0]!;
      await this.files.finalize(segment);
      this.pendingFinalization.shift();
    }
    for (const sessionStartMs of this.pendingClosedSessions.splice(0)) {
      this.options.onSessionClosed(this.options.cameraId, sessionStartMs);
    }
  }

  /** Stops recording once, optionally committing the last segment and index. */
  public close(commit = true): Promise<void> {
    this.closePromise ??= this.closeInternal(commit);
    return this.closePromise;
  }

  /** Keeps incomplete media partial and closes all remaining handles on failure. */
  private async closeInternal(commit: boolean): Promise<void> {
    this.closed = true;
    const active = this.active;
    this.active = undefined;
    if (active !== undefined) this.pendingFinalization.push(active);
    const failures: unknown[] = [];
    try {
      if (commit) {
        await this.completeBatch();
        this.options.onSessionClosed(this.options.cameraId, this.session.startMs);
      }
    } catch (error) {
      failures.push(error);
    } finally {
      // Failed/incomplete media stays partial for cache recovery; never publish it.
      for (const segment of this.pendingFinalization.splice(0)) {
        try {
          await this.files.closeHandle(segment);
        } catch (error) {
          failures.push(error);
        }
      }
      this.session.discardPendingConfiguration();
      this.pendingClosedSessions = [];
    }
    if (failures.length) throw new AggregateError(failures, 'Recording finalization failed.');
  }
}
