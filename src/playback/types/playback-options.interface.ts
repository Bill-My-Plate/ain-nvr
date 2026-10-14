import type { PlaybackSource } from './playback-source.interface.js';
/**
 * Configuration options for playback.
 */
export interface PlaybackOptions<TSegmentRef> {
  /** Producer of packets, bytes, or segments consumed by this operation. */
  readonly source: PlaybackSource<TSegmentRef>;
  /**
   * Stable identifier of the camera associated with this value.
   */
  readonly cameraId: string;
  /** Start time in milliseconds. */
  readonly startTimeMs: number;
  /** Abort signal used to cancel this operation. */
  readonly signal?: AbortSignal;
  /** Maximum gap in milliseconds. */
  readonly maximumGapMs?: number;
  /** Maximum bootstrap measured in bytes. */
  readonly maximumBootstrapBytes?: number;
  /** Maximum bootstrap duration in milliseconds. */
  readonly maximumBootstrapDurationMs?: number;
}
