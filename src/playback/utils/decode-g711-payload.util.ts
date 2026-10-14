import { PLAYBACK_CONSTANTS } from '../constants/playback-numeric-values.constant.js';
import { decodeMuLaw } from './decode-mu-law.util.js';
import { decodeALaw } from './decode-a-law.util.js';
/**
 * Converts a complete PCMU or PCMA payload into signed 16-bit PCM bytes.
 * @param payload G.711 audio payload with one encoded 8-bit sample per byte; the number of samples equals the buffer length.
 */
export function decodeG711Payload(payload: Buffer, codec: 'pcmu' | 'pcma'): Buffer {
  const pcm = Buffer.allocUnsafe(payload.length * PLAYBACK_CONSTANTS.pcmSampleBytes);
  for (let index = 0; index < payload.length; index += 1) {
    const encoded = payload[index] ?? 0;
    pcm.writeInt16LE(
      codec === 'pcmu' ? decodeMuLaw(encoded) : decodeALaw(encoded),
      index * PLAYBACK_CONSTANTS.pcmSampleBytes,
    );
  }
  return pcm;
}
