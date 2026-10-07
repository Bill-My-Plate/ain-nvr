





import type { PlaybackSource } from './playback-source.interface.js';

export interface PlaybackOptions<TSegmentRef> {
  readonly source: PlaybackSource<TSegmentRef>;
  readonly cameraId: string;
  readonly startTimeMs: number;
  readonly signal?: AbortSignal;
  readonly maximumGapMs?: number;
  readonly maximumBootstrapBytes?: number;
  readonly maximumBootstrapDurationMs?: number;
}
