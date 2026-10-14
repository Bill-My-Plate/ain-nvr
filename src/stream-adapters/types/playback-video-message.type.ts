import type { PlaybackMessage } from '../../playback/index.js';
/**
 * H.264 playback unit handed to the RTSP packetizer with its media timestamp.
 */
export type PlaybackVideoMessage = Extract<
  PlaybackMessage,
  {
    /** Discriminant identifying this message variant. */
    readonly kind: 'video';
  }
>;
