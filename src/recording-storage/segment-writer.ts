import { mkdir, open, stat, statfs, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { H264CodecConfiguration } from '../rtp/h264-configuration.js';
import { serializeInterleavedFrame, type RecordingIndexEvent, type RecordingPacketWriter, type RecordingWriteRequest } from '../recording-parser/recording-parser.js';
import type { ActiveRecordingSegment, PacketLocation, RecordingSegmentWriterOptions, SegmentMetadata, SessionMetadata } from './metadata.js';
import { RecordingFileUtil } from './file-operations.js';
import { RecordingPathUtil, RecordingSegmentWriterUtil } from './writer-utils.js';

export class RecordingSegmentWriter implements RecordingPacketWriter<PacketLocation> {
  private DEFAULT_PLAYPOINT_INTERVAL_MS = 2_000;
  private DEFAULT_MINIMUM_FREE_BYTES = 512 * 1024 * 1024;
  private DISK_CHECK_INTERVAL_MS = 10_000;
  private playpointIntervalMs: number;
  private minimumFreeBytes: number;
  private sessionMetadata: SessionMetadata;
  private currentSessionStartMs: number;
  private currentSessionDirectory: string;
  private currentSessionMetadataPath: string;
  private pendingSessionMetadata: SessionMetadata | undefined;
  private active: ActiveRecordingSegment | undefined;
  private lastSegmentStartMs: number | undefined;
  private lastDiskCheckMs = 0;
  private closed = false;
  private closePromise: Promise<void> | undefined;
  private pendingFinalization: ActiveRecordingSegment[] = [];
  private pendingClosedSessions: number[] = [];
  private closedHandles = new WeakSet<ActiveRecordingSegment>();

  private constructor(
    private options: RecordingSegmentWriterOptions,
  ) {
    this.playpointIntervalMs = RecordingSegmentWriterUtil.positiveInteger(
      options.playpointIntervalMs ?? this.DEFAULT_PLAYPOINT_INTERVAL_MS,
      'playpointIntervalMs',
    );
    this.minimumFreeBytes = RecordingSegmentWriterUtil.positiveInteger(
      options.minimumFreeBytes ?? this.DEFAULT_MINIMUM_FREE_BYTES,
      'minimumFreeBytes',
    );
    RecordingSegmentWriterUtil.positiveInteger(
      options.segmentDurationMs,
      'segmentDurationMs',
    );
    this.currentSessionStartMs = options.sessionStartMs;
    this.currentSessionDirectory = RecordingPathUtil.resolveInsideRoot(
      options.cacheRoot,
      options.cameraId,
      String(options.sessionStartMs),
    );
    this.currentSessionMetadataPath = path.join(
      this.currentSessionDirectory,
      'session.json',
    );
    this.sessionMetadata = this.createSessionMetadata(options.sessionStartMs);
  }

  public static async create(
    options: RecordingSegmentWriterOptions,
  ): Promise<RecordingSegmentWriter> {
    const writer = new RecordingSegmentWriter(options);
    await writer.reserveSessionDirectory();
    await RecordingFileUtil.writeJsonAtomic(
      writer.currentSessionMetadataPath,
      writer.sessionMetadata,
    );
    return writer;
  }

  public async write(
    request: RecordingWriteRequest,
  ): Promise<PacketLocation> {
    if (this.closed) throw new Error('Recording writer is closed.');
    await this.checkDiskSpace(request.packet.arrivalTimeMs);

    if (request.boundaryBefore && this.active !== undefined) {
      const completed = this.active;
      const closedSessionStartMs = this.currentSessionStartMs;
      this.active = undefined;
      this.pendingFinalization.push(completed);
      if (this.pendingSessionMetadata !== undefined) {
        await this.beginConfigurationSession(request.packet.arrivalTimeMs);
        this.pendingClosedSessions.push(closedSessionStartMs);
      }
    }

    const active =
      this.active ??
      (await this.openSegment(
        request.packet.arrivalTimeMs,
        request.discontinuityBefore,
      ));
    const bytes = serializeInterleavedFrame(request.packet);
    const byteOffset = active.bytes;
    let written = 0;
    while (written < bytes.length) {
      const result = await active.handle.write(
        bytes,
        written,
        bytes.length - written,
        null,
      );
      if (result.bytesWritten === 0) {
        throw new Error('Recording write made no progress.');
      }
      written += result.bytesWritten;
    }
    active.bytes += bytes.length;
    active.endTimeMs = Math.max(active.endTimeMs, request.packet.arrivalTimeMs);
    return { segment: active, byteOffset };
  }

  public async applyEvents(
    events: readonly RecordingIndexEvent<PacketLocation>[],
  ): Promise<void> {
    for (const event of events) {
      if (event.type === 'configuration') {
        await this.updateConfiguration(event.trackId, event.configuration);
        continue;
      }

      const { segment, byteOffset } = event.location;
      switch (event.type) {
        case 'packet':
          segment.endTimeMs = Math.max(segment.endTimeMs, event.timeMs);
          break;
        case 'clock-anchor': {
          const anchor = {
            trackId: event.trackId,
            source: event.source,
            timeMs: event.timeMs,
            rtpTimestamp: event.rtpTimestamp,
            byteOffset,
          } as const;
          const existingIndex = segment.clockAnchors.findIndex(
            (candidate) =>
              candidate.trackId === event.trackId &&
              candidate.byteOffset === byteOffset,
          );
          if (existingIndex < 0) segment.clockAnchors.push(anchor);
          else segment.clockAnchors[existingIndex] = anchor;
          break;
        }
        case 'playpoint':
          segment.playpoints.push({
            timeMs: event.timeMs,
            offsetMs: Math.max(0, event.timeMs - segment.startMs),
            byteOffset,
          });
          break;
        case 'keyframe':
          segment.keyframes.push({
            timeMs: event.timeMs,
            offsetMs: Math.max(0, event.timeMs - segment.startMs),
            byteOffset,
            rtpTimestamp: event.rtpTimestamp,
            sequenceNumber: event.sequenceNumber,
          });
          break;
        case 'discontinuity':
          break;
      }
    }
  }

  /** Called only after the parser's complete index batch has been applied. */
  public async completeBatch(): Promise<void> {
    while (this.pendingFinalization.length > 0) {
      const segment = this.pendingFinalization[0]!;
      await this.finalize(segment);
      this.pendingFinalization.shift();
    }
    for (const sessionStartMs of this.pendingClosedSessions.splice(0)) {
      this.options.onSessionClosed(this.options.cameraId, sessionStartMs);
    }
  }

  public close(commit = true): Promise<void> {
    this.closePromise ??= this.closeInternal(commit);
    return this.closePromise;
  }

  private async closeInternal(commit: boolean): Promise<void> {
    this.closed = true;
    const active = this.active;
    this.active = undefined;
    if (active !== undefined) this.pendingFinalization.push(active);
    const failures: unknown[] = [];
    try {
      if (commit) {
        await this.completeBatch();
        this.options.onSessionClosed(
          this.options.cameraId,
          this.currentSessionStartMs,
        );
      }
    } catch (error) {
      failures.push(error);
    } finally {
      // Failed/incomplete media stays partial for cache recovery; never publish it.
      for (const segment of this.pendingFinalization.splice(0)) {
        try {
          await this.closeHandle(segment);
        } catch (error) {
          failures.push(error);
        }
      }
      this.pendingSessionMetadata = undefined;
      this.pendingClosedSessions = [];
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        'Recording finalization failed.',
      );
  }

  private createSessionMetadata(sessionStartMs: number): SessionMetadata {
    return {
      schemaVersion: 1,
      cameraId: this.options.cameraId,
      sessionStartMs,
      createdAt: new Date(sessionStartMs).toISOString(),
      segmentDurationMs: this.options.segmentDurationMs,
      playpointIntervalMs: this.playpointIntervalMs,
      sdp: this.options.sessionInfo.sdp,
      tracks: this.options.sessionInfo.tracks.map((track) =>
        RecordingSegmentWriterUtil.toSessionTrack(track),
      ),
    };
  }

  private async openSegment(
    requestedStartMs: number,
    discontinuityBefore: boolean,
  ): Promise<ActiveRecordingSegment> {
    const startMs = Math.max(
      requestedStartMs,
      (this.lastSegmentStartMs ?? requestedStartMs - 1) + 1,
    );
    this.lastSegmentStartMs = startMs;
    const hourStartMs = RecordingPathUtil.nativeHourStart(startMs);
    const directory = path.join(
      this.currentSessionDirectory,
      String(hourStartMs),
    );
    await mkdir(directory, { recursive: true });
    const mediaPath = path.join(directory, `${startMs}.rtsp`);
    const partialMediaPath = `${mediaPath}.partial`;
    const active: ActiveRecordingSegment = {
      sessionStartMs: this.currentSessionStartMs,
      sessionMetadataPath: this.currentSessionMetadataPath,
      startMs,
      hourStartMs,
      partialMediaPath,
      mediaPath,
      metadataPath: path.join(directory, `${startMs}.json`),
      handle: await open(partialMediaPath, 'wx', 0o600),
      discontinuityBefore,
      clockAnchors: [],
      playpoints: [],
      keyframes: [],
      bytes: 0,
      endTimeMs: startMs,
    };
    this.active = active;
    return active;
  }

  private async finalize(segment: ActiveRecordingSegment): Promise<void> {
    const failures: unknown[] = [];
    try {
      await segment.handle.sync();
    } catch (error) {
      failures.push(error);
    }
    try {
      await this.closeHandle(segment);
    } catch (error) {
      failures.push(error);
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        'Recording file sync/close failed.',
      );
    if (segment.bytes === 0) {
      await unlink(segment.partialMediaPath);
      return;
    }
    await RecordingFileUtil.publishFileAtomic(
      segment.partialMediaPath,
      segment.mediaPath,
    );
    const metadata: SegmentMetadata = {
      schemaVersion: 1,
      cameraId: this.options.cameraId,
      sessionStartMs: segment.sessionStartMs,
      segmentStartMs: segment.startMs,
      endTimeMs: segment.endTimeMs,
      durationMs: Math.max(0, segment.endTimeMs - segment.startMs),
      complete: true,
      bytes: segment.bytes,
      discontinuityBefore: segment.discontinuityBefore,
      clockAnchors: segment.clockAnchors,
      playpointIntervalMs: this.playpointIntervalMs,
      playpoints: segment.playpoints,
      keyframes: segment.keyframes,
    };
    await RecordingFileUtil.writeJsonAtomic(
      segment.metadataPath,
      metadata,
    );
    this.options.onCommitted({
      cameraId: this.options.cameraId,
      sessionStartMs: segment.sessionStartMs,
      hourStartMs: segment.hourStartMs,
      segmentStartMs: segment.startMs,
      mediaPath: segment.mediaPath,
      metadataPath: segment.metadataPath,
      sessionMetadataPath: segment.sessionMetadataPath,
    });
  }

  private async closeHandle(
    segment: ActiveRecordingSegment,
  ): Promise<void> {
    if (this.closedHandles.has(segment)) return;
    this.closedHandles.add(segment);
    await segment.handle.close();
  }

  private async updateConfiguration(
    trackId: string,
    configuration: H264CodecConfiguration,
  ): Promise<void> {
    const sps = configuration.sps.toString('base64');
    const pps = configuration.pps.toString('base64');
    const current = this.sessionMetadata.tracks.find(
      (track) => track.trackId === trackId,
    );
    if (
      current?.parameterSetsBase64?.sps === sps &&
      current.parameterSetsBase64.pps === pps
    ) {
      return;
    }
    const updated: SessionMetadata = {
      ...this.sessionMetadata,
      tracks: this.sessionMetadata.tracks.map((track) =>
        track.trackId === trackId
          ? {
              ...track,
              webCodec: configuration.decoder,
              parameterSetsBase64: { sps, pps },
            }
          : track,
      ),
    };
    if (current?.parameterSetsBase64 !== undefined) {
      this.pendingSessionMetadata = updated;
      this.options.onConfigurationChanged?.();
      return;
    }
    this.sessionMetadata = updated;
    await RecordingFileUtil.writeJsonAtomic(
      this.currentSessionMetadataPath,
      this.sessionMetadata,
    );
  }

  private async beginConfigurationSession(startMs: number): Promise<void> {
    const pending = this.pendingSessionMetadata;
    if (pending === undefined) return;
    this.pendingSessionMetadata = undefined;
    this.currentSessionStartMs = Math.max(
      startMs,
      this.currentSessionStartMs + 1,
    );
    this.currentSessionDirectory = RecordingPathUtil.resolveInsideRoot(
      this.options.cacheRoot,
      this.options.cameraId,
      String(this.currentSessionStartMs),
    );
    this.currentSessionMetadataPath = path.join(
      this.currentSessionDirectory,
      'session.json',
    );
    this.sessionMetadata = {
      ...pending,
      sessionStartMs: this.currentSessionStartMs,
      createdAt: new Date(this.currentSessionStartMs).toISOString(),
    };
    await this.reserveSessionDirectory();
    await RecordingFileUtil.writeJsonAtomic(
      this.currentSessionMetadataPath,
      this.sessionMetadata,
    );
  }

  private async reserveSessionDirectory(): Promise<void> {
    const cameraDirectory = RecordingPathUtil.resolveInsideRoot(
      this.options.cacheRoot,
      this.options.cameraId,
    );
    await mkdir(cameraDirectory, { recursive: true });
    for (;;) {
      // Cache cleanup must not allow a later attempt to reuse a published session ID.
      if (this.options.finalRoot) {
        try {
          await stat(
            RecordingPathUtil.resolveInsideRoot(
              this.options.finalRoot,
              this.options.cameraId,
              String(this.currentSessionStartMs),
            ),
          );
          this.currentSessionStartMs++;
          continue;
        } catch (error) {
          if (
            !error ||
            typeof error !== 'object' ||
            !('code' in error) ||
            error.code !== 'ENOENT'
          )
            throw error;
        }
      }
      this.currentSessionDirectory = path.join(
        cameraDirectory,
        String(this.currentSessionStartMs),
      );
      try {
        await mkdir(this.currentSessionDirectory);
        break;
      } catch (error) {
        if (
          !error ||
          typeof error !== 'object' ||
          !('code' in error) ||
          error.code !== 'EEXIST'
        )
          throw error;
        this.currentSessionStartMs++;
      }
    }
    this.currentSessionMetadataPath = path.join(
      this.currentSessionDirectory,
      'session.json',
    );
    this.sessionMetadata = {
      ...this.sessionMetadata,
      sessionStartMs: this.currentSessionStartMs,
      createdAt: new Date(this.currentSessionStartMs).toISOString(),
    };
  }

  private async checkDiskSpace(arrivalTimeMs: number): Promise<void> {
    if (arrivalTimeMs - this.lastDiskCheckMs < this.DISK_CHECK_INTERVAL_MS)
      return;
    this.lastDiskCheckMs = arrivalTimeMs;
    const stats = await statfs(this.options.cacheRoot);
    const freeBytes = stats.bavail * stats.bsize;
    if (freeBytes < this.minimumFreeBytes) {
      const error = new Error(
        `Recording stopped because free storage is below ${this.minimumFreeBytes} bytes.`,
      ) as NodeJS.ErrnoException;
      error.code = 'ENOSPC';
      throw error;
    }
  }
}
