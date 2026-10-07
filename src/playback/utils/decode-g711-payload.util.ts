

import { decodeMuLaw } from './decode-mu-law.util.js';
import { decodeALaw } from './decode-a-law.util.js';

export function decodeG711Payload(payload: Buffer, codec: 'pcmu' | 'pcma'): Buffer {
  const pcm = Buffer.allocUnsafe(payload.length * 2);
  for (let index = 0; index < payload.length; index += 1) {
    const encoded = payload[index] ?? 0;
    pcm.writeInt16LE(codec === 'pcmu' ? decodeMuLaw(encoded) : decodeALaw(encoded), index * 2);
  }
  return pcm;
}
