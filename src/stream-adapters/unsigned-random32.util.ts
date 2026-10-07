import { randomBytes } from 'node:crypto';


export function unsignedRandom32(): number {
  return randomBytes(4).readUInt32BE(0);
}
