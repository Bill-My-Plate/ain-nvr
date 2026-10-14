import { type H264AccessUnit } from '../../h264/index.js';
/**
 * H.264 access unit paired with its playback wall-clock time.
 */
export type PlaybackVideoAccessUnit = H264AccessUnit & {
  /** Discriminant identifying this command, event, or message variant. */
  readonly kind: 'video';
};
