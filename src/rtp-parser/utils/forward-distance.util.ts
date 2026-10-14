import { RTP_SEQUENCE_SPACE } from '../constants/rtp-sequence-space.constant.js';
/**
 * Count forward sequence steps in the 16-bit RTP sequence space.
 * For example, moving from 65535 to 0 has a distance of 1 because the number wraps.
 * The caller decides whether a large forward distance actually means a late packet.
 */
export function forwardDistance(from: number, to: number): number {
  // Keep the low 16 bits of the difference, equivalent to wrapping modulo 65536.
  return (to - from) & RTP_SEQUENCE_SPACE.mask;
}
