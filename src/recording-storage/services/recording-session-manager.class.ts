import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { H264CodecConfiguration } from '../../h264/index.js';
import type { RecordingSegmentWriterOptions } from '../types/recording-segment-writer-options.type.js';
import type { SessionMetadata } from '../types/session-metadata.type.js';
import { RecordingFileUtil } from './recording-file-util.class.js';
import { RecordingPathUtil } from './recording-path-util.class.js';
import { RecordingSegmentWriterUtil } from './recording-segment-writer-util.class.js';

/** Owns session directory identity and codec metadata across configuration changes. */
export class RecordingSessionManager {
  private currentSessionStartMs: number;
  private currentSessionDirectory: string;
  private currentSessionMetadataPath: string;
  private sessionMetadata: SessionMetadata;
  private pendingSessionMetadata: SessionMetadata | undefined;

  /** Creates the first session state without writing files yet. */
  public constructor(
    private readonly options: RecordingSegmentWriterOptions,
    private readonly playpointIntervalMs: number,
  ) {
    this.currentSessionStartMs = options.sessionStartMs;
    this.currentSessionDirectory = RecordingPathUtil.resolveInsideRoot(
      options.cacheRoot,
      options.cameraId,
      String(options.sessionStartMs),
    );
    this.currentSessionMetadataPath = path.join(this.currentSessionDirectory, 'session.json');
    this.sessionMetadata = this.createSessionMetadata(options.sessionStartMs);
  }

  /** Returns the collision-safe start time of the current session. */
  public get startMs(): number {
    return this.currentSessionStartMs;
  }

  /** Returns the directory that receives this session's segment files. */
  public get directory(): string {
    return this.currentSessionDirectory;
  }

  /** Returns the published metadata path for this session. */
  public get metadataPath(): string {
    return this.currentSessionMetadataPath;
  }

  /** Indicates that a codec change requires a new session at the next boundary. */
  public get hasPendingConfiguration(): boolean {
    return this.pendingSessionMetadata !== undefined;
  }

  /** Reserves a unique session directory and publishes its initial metadata. */
  public async initialize(): Promise<void> {
    await this.reserveSessionDirectory();
    await RecordingFileUtil.writeJsonAtomic(this.currentSessionMetadataPath, this.sessionMetadata);
  }

  /** Updates the current codec metadata or defers a changed codec until rotation. */
  public async updateConfiguration(
    trackId: string,
    configuration: H264CodecConfiguration,
  ): Promise<void> {
    const sps = configuration.sps.toString('base64');
    const pps = configuration.pps.toString('base64');
    const current = this.sessionMetadata.tracks.find((track) => track.trackId === trackId);
    if (current?.parameterSetsBase64?.sps === sps && current.parameterSetsBase64.pps === pps) {
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
    await RecordingFileUtil.writeJsonAtomic(this.currentSessionMetadataPath, this.sessionMetadata);
  }

  /** Starts the pending codec session after the old segment stops accepting packets. */
  public async beginConfigurationSession(startMs: number): Promise<void> {
    const pending = this.pendingSessionMetadata;
    if (pending === undefined) return;
    this.pendingSessionMetadata = undefined;
    this.currentSessionStartMs = Math.max(startMs, this.currentSessionStartMs + 1);
    this.currentSessionDirectory = RecordingPathUtil.resolveInsideRoot(
      this.options.cacheRoot,
      this.options.cameraId,
      String(this.currentSessionStartMs),
    );
    this.currentSessionMetadataPath = path.join(this.currentSessionDirectory, 'session.json');
    this.sessionMetadata = {
      ...pending,
      sessionStartMs: this.currentSessionStartMs,
      createdAt: new Date(this.currentSessionStartMs).toISOString(),
    };
    await this.reserveSessionDirectory();
    await RecordingFileUtil.writeJsonAtomic(this.currentSessionMetadataPath, this.sessionMetadata);
  }

  /** Drops an unpublished codec change when the writer closes. */
  public discardPendingConfiguration(): void {
    this.pendingSessionMetadata = undefined;
  }

  /** Builds the schema-1 session metadata saved beside its segments. */
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

  /** Avoids reusing a session ID already present in cache or final storage. */
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
          if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
            throw error;
        }
      }
      this.currentSessionDirectory = path.join(cameraDirectory, String(this.currentSessionStartMs));
      try {
        await mkdir(this.currentSessionDirectory);
        break;
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST')
          throw error;
        this.currentSessionStartMs++;
      }
    }
    this.currentSessionMetadataPath = path.join(this.currentSessionDirectory, 'session.json');
    this.sessionMetadata = {
      ...this.sessionMetadata,
      sessionStartMs: this.currentSessionStartMs,
      createdAt: new Date(this.currentSessionStartMs).toISOString(),
    };
  }
}
