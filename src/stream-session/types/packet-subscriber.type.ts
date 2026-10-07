











import type { MediaPacket } from '../../media/index.js';

export type PacketSubscriber = (packet: MediaPacket) => void;
