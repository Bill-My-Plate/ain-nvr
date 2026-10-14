/** Named protocol fields, time units, and operational limits for frame-extractor. */
export const FRAME_EXTRACTOR_CONSTANTS = {
  defaultMediaTimeoutMs: 15_000,
  defaultReconnectInitialMs: 1_000,
  defaultReconnectMaximumMs: 30_000,
  maximumFrameDimensionPixels: 8_192,
  estimatedPacketBytes: 65_536,
  maximumProbePackets: 256,
  maximumProbeBytes: 8 * 1024 * 1024,
  maximumProbeDurationMs: 10_000,
  maximumFramesPerSecond: 60,
  defaultFramesPerSecond: 4,
  defaultJpegQuality: 0.9,
  reconnectBackoffMultiplier: 2,
} as const;
