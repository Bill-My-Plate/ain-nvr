import type { PlaybackClock } from './playback-clock.type.js';
/**
 * Configuration options for playback Pacer.
 */
export interface PlaybackPacerOptions {
  /** Max lookahead in microseconds. */
  readonly maxLookaheadUs?: number;
  /** Clock used for wall-time scheduling and cancellable sleeps. */
  readonly clock?: PlaybackClock;
}
