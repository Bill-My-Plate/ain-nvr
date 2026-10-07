
import type { RuntimeSettings } from '../types/runtime-settings.type.js';

export const defaults: RuntimeSettings = {
  maxCameras: 32, maxStartingCameras: 4, maxLeasesPerCamera: 128, maxFrameSubscribers: 16,
  acquireTimeoutMs: 20_000, operationTimeoutMs: 30_000, shutdownTimeoutMs: 10_000,
  firstFrameTimeoutMs: 30_000, callbackTimeoutMs: 10_000,
  maximumFrameBytes: 8 * 1024 * 1024, maximumFrameAgeMs: 2_000,
  maximumPendingEvents: 128, maxWorkerRestarts: 1, restartDelayMs: 500,
};
