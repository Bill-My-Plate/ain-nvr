import type { PlaybackClock } from './playback-clock.type.js';
import { defaultSleep } from './default-sleep.util.js';

export const SYSTEM_CLOCK: PlaybackClock = {
  nowMs: () => performance.now(),
  sleep: defaultSleep,
};
