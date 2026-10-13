/** Ports, timers, and retry limits used by one RTSP camera connection. */
export const RTSP_CLIENT_DEFAULTS = {
  rtspPort: 554,
  rtspsPort: 322,
  connectTimeoutMs: 5_000,
  requestTimeoutMs: 5_000,
  mediaTimeoutMs: 15_000,
  closeGraceMs: 250,
  fallbackSessionTimeoutSeconds: 60,
  keepaliveMsPerSessionSecond: 500,
  minimumKeepaliveMs: 1_000,
  minimumWatchdogIntervalMs: 250,
  maximumWatchdogIntervalMs: 1_000,
  watchdogIntervalDivisor: 3,
  authenticatedRequestAttempts: 3,
  singleRequestAttempt: 1,
  emptyBodyLength: 0,
} as const;
