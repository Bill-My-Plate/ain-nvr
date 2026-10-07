

import { failure } from './failure.util.js';

export function cameraIdentity(cameraId: string, url: string): void {
  // A single portable directory name, independent from application-specific Mongo IDs.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(cameraId)) throw failure('EINVAL', 'cameraId must be a portable path component (letters, numbers, _ or -).');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw failure('EINVAL', 'Invalid RTSP URL.'); }
  if (!['rtsp:', 'rtsps:'].includes(parsed.protocol) || parsed.hostname.length === 0) throw failure('EINVAL', 'Camera URL must use rtsp:// or rtsps://.');
}
