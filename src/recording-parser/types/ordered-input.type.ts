import type { MediaPacket } from '../../media/index.js';








export type OrderedInput = {
  readonly packet: MediaPacket;
  readonly lostBefore: number;
};
