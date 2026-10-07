




import { START_CODE } from '../constants/start-code.constant.js';

export function annexB(nalUnits: readonly Buffer[]): Buffer {
  const parts: Buffer[] = [];
  for (const nal of nalUnits) parts.push(START_CODE, nal);
  return Buffer.concat(parts);
}
