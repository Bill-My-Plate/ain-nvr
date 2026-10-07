import type { PlaybackClock } from './playback-clock.type.js';

export interface PlaybackPacerOptions {
  readonly maxLookaheadUs?: number;
  readonly clock?: PlaybackClock;
}
