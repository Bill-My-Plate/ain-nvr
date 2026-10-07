export type PlaybackClock = {
  nowMs(): number;
  sleep(milliseconds: number, signal: AbortSignal): Promise<void>;
};
