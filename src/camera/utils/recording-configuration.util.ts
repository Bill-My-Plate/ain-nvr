import { CAMERA_CONSTANTS } from '../constants/camera-numeric-values.constant.js';
import { isAbsolute } from 'node:path';
import type { RecordingOptions } from '../types/recording-options.interface.js';
import { failure } from './failure.util.js';
import { type RecordingConfiguration } from '../types/recording-configuration.type.js';
/**
 * Validates and normalizes recording duration and storage limits.
 */
export function recordingConfiguration(options: RecordingOptions): RecordingConfiguration {
  for (const [name, value] of Object.entries({
    segmentDurationMs: options.segmentDurationMs,
    playpointIntervalMs:
      options.playpointIntervalMs ?? CAMERA_CONSTANTS.defaultSegmentDurationMs,
    minimumFreeBytes: options.minimumFreeBytes ?? CAMERA_CONSTANTS.defaultMinimumFreeBytes,
  })) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw failure('EINVAL', `${name} must be a positive safe integer.`);
  }
  if (
    !isAbsolute(options.cacheRoot) ||
    (options.finalRoot !== undefined && !isAbsolute(options.finalRoot))
  ) {
    throw failure('EINVAL', 'Recording roots must be absolute filesystem paths.');
  }
  if (typeof options.onCommitted !== 'function' || typeof options.onError !== 'function')
    throw failure('EINVAL', 'Recording callbacks are required.');
  return {
    cacheRoot: options.cacheRoot,
    segmentDurationMs: options.segmentDurationMs,
    ...(options.finalRoot === undefined ? {} : { finalRoot: options.finalRoot }),
    ...(options.playpointIntervalMs === undefined
      ? {}
      : { playpointIntervalMs: options.playpointIntervalMs }),
    ...(options.minimumFreeBytes === undefined
      ? {}
      : { minimumFreeBytes: options.minimumFreeBytes }),
  };
}
