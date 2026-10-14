import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
import { randomBytes } from 'node:crypto';
/**
 * Reads four random bytes as an unsigned 32-bit RTP seed.
 */
export function unsignedRandom32(): number {
  return randomBytes(STREAM_ADAPTER_CONSTANTS.randomUint32Bytes).readUInt32BE(0);
}
