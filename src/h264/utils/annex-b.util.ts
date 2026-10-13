




import { START_CODE } from '../constants/start-code.constant.js';

/** Prefix each raw NAL unit with a four-byte Annex-B start code (00 00 00 01). */
export function annexB(nalUnits: readonly Buffer[]): Buffer {
  const parts: Buffer[] = [];
  for (const nal of nalUnits) parts.push(START_CODE, nal);
  return Buffer.concat(parts);
}
