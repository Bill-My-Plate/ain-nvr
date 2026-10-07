import type { LibavPacketLike } from './libav-packet-like.type.js';

export type LibavReceivedPacket = LibavPacketLike & {
  readonly type: 'packet';
};
