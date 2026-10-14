import type { LibavPacketLike } from './libav-packet-like.type.js';
/**
 * Encoded packet paired with its demuxed stream information.
 */
export type LibavReceivedPacket = LibavPacketLike & {
  /** Discriminant or media type used to interpret this value. */
  readonly type: 'packet';
};
