import type { PlaypointMetadata } from './playpoint-metadata.type.js';
/**
 * Stored position and time of a seekable H.264 keyframe.
 */
export type KeyframeMetadata = PlaypointMetadata & {
  /** RTP timestamp in the track clock rate; it is not Unix time. */
  rtpTimestamp: number;
  /** Unsigned RTP sequence number, wrapping after 65535. */
  sequenceNumber: number;
};
