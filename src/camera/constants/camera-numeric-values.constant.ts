/** Recording queue limits and camera option defaults. */
export const CAMERA_CONSTANTS = {
  maxQueuedMediaBytes: 8 * 1024 * 1024,
  pauseQueuedMediaBytes: 4 * 1024 * 1024,
  maxQueuedMediaPackets: 4_096,
  defaultSegmentDurationMs: 2_000,
  defaultMinimumFreeBytes: 512 * 1024 * 1024,
  defaultFramesPerSecond: 4,
  defaultJpegQuality: 0.9,
  maximumFramesPerSecond: 60,
} as const;
