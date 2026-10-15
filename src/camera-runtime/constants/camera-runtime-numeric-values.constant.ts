/** Worker protocol limits, time units, and operational thresholds. */
export const CAMERA_RUNTIME_CONSTANTS = {
  statusPublishIntervalMs: 1_000,
  nanosecondsPerMillisecond: 1_000_000,
  rtspUnauthorizedStatus: 401,
  rtspForbiddenStatus: 403,
  rtspUnsupportedTransportStatus: 461,
  rtspNotFoundStatus: 404,
  maximumSerializedErrorChars: 2_048,
  maximumQueuedWorkerEvents: 64,
  maximumPendingCameraCommands: 64,
  maximumDecoderErrors: 3,
  eventLoopResolutionMs: 20,
  maximumErrorCauseDepth: 8,
} as const;
