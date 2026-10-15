import { mkdir, open, statfs, unlink } from 'node:fs/promises';
import path from 'node:path';
import { serializeInterleavedFrame, type RecordingWriteRequest } from '../../recording-parser/index.js';
import { RECORDING_STORAGE_CONSTANTS } from '../constants/recording-storage-numeric-values.constant.js';
import type { ActiveRecordingSegment } from '../types/active-recording-segment.type.js';
import type { PacketLocation } from '../types/packet-location.type.js';
import type { RecordingSegmentWriterOptions } from '../types/recording-segment-writer-options.type.js';
import type { SegmentMetadata } from '../types/segment-metadata.type.js';
import { RecordingFileUtil } from './recording-file-util.class.js';
import { RecordingPathUtil } from './recording-path-util.class.js';
import { RecordingSessionManager } from './recording-session-manager.class.js';

/** Owns segment file handles, packet bytes, disk checks, and publication. */
export class RecordingSegmentFileManager {
  private lastSegmentStartMs: number | undefined;
  private lastDiskCheckMs = 0;
  private readonly closedHandles = new WeakSet<ActiveRecordingSegment>();

  /** Receives the session state needed to place and describe each segment. */
  public constructor(
    private readonly options: RecordingSegmentWriterOptions,
    private readonly session: RecordingSessionManager,
    private readonly playpointIntervalMs: number,
    private readonly minimumFreeBytes: number,
  ) {}

  /** Checks cache capacity at the established recording interval. */
  public async checkDiskSpace(arrivalTimeMs: number): Promise<void> {
    if (arrivalTimeMs - this.lastDiskCheckMs < RECORDING_STORAGE_CONSTANTS.diskCheckIntervalMs)
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

  /** Opens a private partial file in the current session and hour bucket. */
  public async openSegment(
    requestedStartMs: number,
    discontinuityBefore: boolean,
  ): Promise<ActiveRecordingSegment> {
    const startMs = Math.max(
      requestedStartMs,
      (this.lastSegmentStartMs ?? requestedStartMs - 1) + 1,
    );
    this.lastSegmentStartMs = startMs;
    const hourStartMs = RecordingPathUtil.nativeHourStart(startMs);
    const directory = path.join(this.session.directory, String(hourStartMs));
    await mkdir(directory, { recursive: true });
    const mediaPath = path.join(directory, `${startMs}.rtsp`);
    const partialMediaPath = `${mediaPath}.partial`;
    return {
      sessionStartMs: this.session.startMs,
      sessionMetadataPath: this.session.metadataPath,
      startMs,
      hourStartMs,
      partialMediaPath,
      mediaPath,
      metadataPath: path.join(directory, `${startMs}.json`),
      handle: await open(partialMediaPath, 'wx', RECORDING_STORAGE_CONSTANTS.privateFileMode),
      discontinuityBefore,
      clockAnchors: [],
      playpoints: [],
      keyframes: [],
      bytes: 0,
      endTimeMs: startMs,
    };
  }

  /** Writes one complete RTSP interleaved frame, including short-write retries. */
  public async writePacket(
    active: ActiveRecordingSegment,
    request: RecordingWriteRequest,
  ): Promise<PacketLocation> {
    const bytes = serializeInterleavedFrame(request.packet);
    const byteOffset = active.bytes;
    let written = 0;
    while (written < bytes.length) {
      const result = await active.handle.write(bytes, written, bytes.length - written, null);
      if (result.bytesWritten === 0) {
        throw new Error('Recording write made no progress.');
      }
      written += result.bytesWritten;
    }
    active.bytes += bytes.length;
    active.endTimeMs = Math.max(active.endTimeMs, request.packet.arrivalTimeMs);
    return { segment: active, byteOffset };
  }

  /** Syncs and closes media before publishing its file, JSON index, and callback. */
  public async finalize(segment: ActiveRecordingSegment): Promise<void> {
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
    if (failures.length) throw new AggregateError(failures, 'Recording file sync/close failed.');
    if (segment.bytes === 0) {
      await unlink(segment.partialMediaPath);
      return;
    }
    await RecordingFileUtil.publishFileAtomic(segment.partialMediaPath, segment.mediaPath);
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
    await RecordingFileUtil.writeJsonAtomic(segment.metadataPath, metadata);
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

  /** Closes a segment handle once, including after an earlier finalize attempt. */
  public async closeHandle(segment: ActiveRecordingSegment): Promise<void> {
    if (this.closedHandles.has(segment)) return;
    this.closedHandles.add(segment);
    await segment.handle.close();
  }
}
