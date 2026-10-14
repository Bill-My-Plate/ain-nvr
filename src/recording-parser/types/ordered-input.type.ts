import type { MediaPacket } from '../../media/index.js';
/**
 * Media packet plus preceding loss count after RTP reordering.
 */
export type OrderedInput = {
  /** Packet emitted from the reorder window. */
  readonly packet: MediaPacket;
  /** Number of RTP packets declared lost immediately before this packet. */
  readonly lostBefore: number;
};
