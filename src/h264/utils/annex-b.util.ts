import { START_CODE } from '../constants/start-code.constant.js';
/**
 * Prefix each raw NAL unit with a four-byte Annex-B start code (00 00 00 01).
 * @param nalUnits Complete NAL buffers; each begins with a one-byte H.264 NAL header and has variable-length body. The output inserts a four-byte Annex B start code before each.
 */
export function annexB(nalUnits: readonly Buffer[]): Buffer {
  const parts: Buffer[] = [];
  for (const nal of nalUnits) parts.push(START_CODE, nal);
  return Buffer.concat(parts);
}
