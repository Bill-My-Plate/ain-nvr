import { isAbsolute } from 'node:path';
import type { FrameOptions, RecordingOptions } from './types.js';
import { failure, type FrameProfile, type RecordingConfiguration } from './protocol.js';

export function cameraIdentity(cameraId: string, url: string): void {
  // A single portable directory name, independent from application-specific Mongo IDs.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(cameraId)) throw failure('EINVAL', 'cameraId must be a portable path component (letters, numbers, _ or -).');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw failure('EINVAL', 'Invalid RTSP URL.'); }
  if (!['rtsp:', 'rtsps:'].includes(parsed.protocol) || parsed.hostname.length === 0) throw failure('EINVAL', 'Camera URL must use rtsp:// or rtsps://.');
}
export function recordingConfiguration(options: RecordingOptions): RecordingConfiguration {
  for (const [name, value] of Object.entries({ segmentDurationMs: options.segmentDurationMs,
    playpointIntervalMs: options.playpointIntervalMs ?? 2_000, minimumFreeBytes: options.minimumFreeBytes ?? 512 * 1024 * 1024 })) {
    if (!Number.isSafeInteger(value) || value <= 0) throw failure('EINVAL', `${name} must be a positive safe integer.`);
  }
  if (!isAbsolute(options.cacheRoot) || (options.finalRoot !== undefined && !isAbsolute(options.finalRoot))) {
    throw failure('EINVAL', 'Recording roots must be absolute filesystem paths.');
  }
  if (typeof options.onCommitted !== 'function' || typeof options.onError !== 'function') throw failure('EINVAL', 'Recording callbacks are required.');
  return {
    cacheRoot: options.cacheRoot, segmentDurationMs: options.segmentDurationMs,
    ...(options.finalRoot === undefined ? {} : { finalRoot: options.finalRoot }),
    ...(options.playpointIntervalMs === undefined ? {} : { playpointIntervalMs: options.playpointIntervalMs }),
    ...(options.minimumFreeBytes === undefined ? {} : { minimumFreeBytes: options.minimumFreeBytes }),
  };
}
export function frameProfile(options: FrameOptions): FrameProfile {
  const framesPerSecond = options.framesPerSecond ?? 4;
  const jpegQuality = options.jpegQuality ?? 0.9;
  if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0 || framesPerSecond > 60) throw failure('EINVAL', 'framesPerSecond must be in (0, 60].');
  if (!Number.isFinite(jpegQuality) || jpegQuality <= 0 || jpegQuality > 1) throw failure('EINVAL', 'jpegQuality must be in (0, 1].');
  if (typeof options.onFrame !== 'function' || typeof options.onError !== 'function') throw failure('EINVAL', 'Frame callbacks are required.');
  return { framesPerSecond, jpegQuality };
}
