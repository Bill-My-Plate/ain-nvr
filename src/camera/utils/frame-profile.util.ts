import { CAMERA_CONSTANTS } from '../constants/camera-numeric-values.constant.js';
import type { FrameOptions } from '../types/frame-options.interface.js';
import { failure } from './failure.util.js';
import { type FrameProfile } from '../types/frame-profile.type.js';
/**
 * Validates frame sampling rate and JPEG quality and fills their defaults.
 */
export function frameProfile(options: FrameOptions): FrameProfile {
  const framesPerSecond =
    options.framesPerSecond ?? CAMERA_CONSTANTS.defaultFramesPerSecond;
  const jpegQuality = options.jpegQuality ?? CAMERA_CONSTANTS.defaultJpegQuality;
  if (
    !Number.isFinite(framesPerSecond) ||
    framesPerSecond <= 0 ||
    framesPerSecond > CAMERA_CONSTANTS.maximumFramesPerSecond
  )
    throw failure('EINVAL', 'framesPerSecond must be in (0, 60].');
  if (!Number.isFinite(jpegQuality) || jpegQuality <= 0 || jpegQuality > 1)
    throw failure('EINVAL', 'jpegQuality must be in (0, 1].');
  if (typeof options.onFrame !== 'function' || typeof options.onError !== 'function')
    throw failure('EINVAL', 'Frame callbacks are required.');
  return { framesPerSecond, jpegQuality };
}
