import type { TimestampedPlaybackItem } from './timestamped-playback-item.type.js';
/**
 * Timestamped playback item associated with a specific track.
 */
export type TrackTimestampedPlaybackItem = TimestampedPlaybackItem & {
  /** Discriminant identifying this command, event, or message variant. */
  readonly kind: 'video' | 'audio';
};
