import type { ExtractedJpegFrame } from '../frame-extractor/rtsp-url-frame-extractor.js';
import type { CommittedSegment } from '../recording-storage/metadata.js';

export type { CommittedSegment } from '../recording-storage/metadata.js';

/** Limits apply to this context's shared managed registry. */
export interface CameraRuntimeOptions {
  readonly maxCameras?: number;
  readonly maxStartingCameras?: number;
  readonly maxLeasesPerCamera?: number;
  readonly maxFrameSubscribers?: number;
  readonly acquireTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly shutdownTimeoutMs?: number;
  readonly firstFrameTimeoutMs?: number;
  readonly callbackTimeoutMs?: number;
  readonly maximumFrameBytes?: number;
  readonly maximumFrameAgeMs?: number;
  readonly maximumPendingEvents?: number;
  /** Replacements per camera lifetime; network reconnects do not consume this budget. */
  readonly maxWorkerRestarts?: number;
  readonly restartDelayMs?: number;
}

export interface RecordingOptions {
  readonly cacheRoot: string;
  /** Used only to avoid session-ID collisions. Promotion remains application-owned. */
  readonly finalRoot?: string;
  readonly segmentDurationMs: number;
  readonly playpointIntervalMs?: number;
  readonly minimumFreeBytes?: number;
  readonly onCommitted: (segment: CommittedSegment) => Promise<void> | void;
  readonly onSessionClosed?: (cameraId: string, sessionStartMs: number) => Promise<void> | void;
  readonly onError: (error: Error) => void;
  readonly onProgress?: () => void;
}

export interface FrameOptions {
  readonly framesPerSecond?: number;
  readonly jpegQuality?: number;
  readonly onFrame: (frame: ExtractedJpegFrame) => Promise<void> | void;
  readonly onError: (error: Error) => void;
}

export interface RecordingHandle {
  readonly completion: Promise<void>;
  requestBoundary(): Promise<void>;
  /** Drains media and publishes files; application notification callbacks are asynchronous. */
  stop(): Promise<void>;
}

export interface FrameHandle {
  /** First JPEG passed to onFrame, distinct from decoder process startup. */
  readonly ready: Promise<void>;
  readonly completion: Promise<void>;
  stop(): Promise<void>;
}

export interface CameraStatus {
  readonly cameraId: string;
  readonly state: 'starting' | 'streaming' | 'reconnecting' | 'restarting' | 'closing' | 'closed' | 'failed';
  readonly workerEpoch: number;
  readonly streamGeneration: number;
  readonly recording: boolean;
  readonly decoder: 'idle' | 'starting' | 'ready' | 'failed';
  readonly framesDelivered: number;
  readonly framesDropped: number;
  readonly recordingQueuedBytes: number;
  readonly workerEventLoopDelayMs: number;
  /** Scan committed cache artifacts after writer ownership has been released. Sticky. */
  readonly reconciliationNeeded: boolean;
  readonly lastError?: Error;
}

export interface CameraLease {
  readonly cameraId: string;
  readonly status: CameraStatus;
  subscribeStatus(listener: (status: CameraStatus) => void): () => void;
  startRecording(options: RecordingOptions): Promise<RecordingHandle>;
  startFrames(options: FrameOptions): Promise<FrameHandle>;
  release(): Promise<void>;
}

export interface CameraRuntime {
  acquire(input: { cameraId: string; url: string; signal?: AbortSignal }): Promise<CameraLease>;
  close(): Promise<void>;
}
