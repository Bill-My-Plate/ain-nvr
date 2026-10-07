
import type { FrameOptions } from './frame-options.interface.js';
import { failure } from './failure.util.js';
import { type FrameProfile } from './frame-profile.type.js';

export function frameProfile(options: FrameOptions): FrameProfile {
  const framesPerSecond = options.framesPerSecond ?? 4;
  const jpegQuality = options.jpegQuality ?? 0.9;
  if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0 || framesPerSecond > 60) throw failure('EINVAL', 'framesPerSecond must be in (0, 60].');
  if (!Number.isFinite(jpegQuality) || jpegQuality <= 0 || jpegQuality > 1) throw failure('EINVAL', 'jpegQuality must be in (0, 1].');
  if (typeof options.onFrame !== 'function' || typeof options.onError !== 'function') throw failure('EINVAL', 'Frame callbacks are required.');
  return { framesPerSecond, jpegQuality };
}
