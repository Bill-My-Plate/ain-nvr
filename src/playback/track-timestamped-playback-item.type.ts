import type { TimestampedPlaybackItem } from './timestamped-playback-item.type.js';

export type TrackTimestampedPlaybackItem = TimestampedPlaybackItem & {
  readonly kind: 'video' | 'audio';
};
