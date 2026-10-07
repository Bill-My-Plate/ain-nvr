import type { LibavPacketLike } from './libav-packet-like.type.js';
import type { LibavFrameLike } from './libav-frame-like.type.js';

export type LibavDecoderLike = {
  readonly vendorInfo?: Record<string, unknown>;
  sendPacket(packet: LibavPacketLike): Promise<boolean>;
  receiveFrame(): Promise<LibavFrameLike | null | undefined>;
  destroy(): void;
};
