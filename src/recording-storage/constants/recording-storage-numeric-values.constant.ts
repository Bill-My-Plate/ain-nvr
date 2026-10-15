/** Named protocol fields, time units, and operational limits for recording-storage. */
export const RECORDING_STORAGE_CONSTANTS = {
  privateFileMode: 0o600,
  maximumRenameRetryDelayMs: 1_200,
  initialRenameRetryDelayMs: 25,
  millisecondsPerHour: 3_600_000,
  defaultPlaypointIntervalMs: 2_000,
  defaultMinimumFreeBytes: 512 * 1024 * 1024,
  defaultSegmentDurationMs: 10_000,
  diskCheckIntervalMs: 10_000,
  jsonIndentSpaces: 2,
  maximumRenameAttempts: 8,
  renameBackoffBase: 2,
} as const;
