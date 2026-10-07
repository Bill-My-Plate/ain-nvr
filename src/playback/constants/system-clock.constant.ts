import type { PlaybackClock } from '../types/playback-clock.type.js';
import { defaultSleep } from '../utils/default-sleep.util.js';

export const SYSTEM_CLOCK: PlaybackClock = {
  nowMs: () => performance.now(),
  sleep: defaultSleep,
};
