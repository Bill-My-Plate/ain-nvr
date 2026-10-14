import type { MediaPacket } from '../../media/index.js';
/** Receives each parsed interleaved media packet from a live session. */
export type PacketSubscriber = (packet: MediaPacket) => void;
