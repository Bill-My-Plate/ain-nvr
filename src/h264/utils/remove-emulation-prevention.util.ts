import { H264_EMULATION_PREVENTION_LAYOUT } from '../constants/h264-emulation-prevention-layout.constant.js';
/**
 * Convert encoded NAL payload bytes to RBSP bytes by removing 03 inserted
 * after two consecutive 00 bytes. Input excludes the NAL header and any
 * Annex-B start code.
 * @param data Variable-length H.264 RBSP data. The `00 00 03` escape sequence is reduced to `00 00` before bit-level parsing.
 */
export function removeEmulationPrevention(data: Buffer): Buffer {
  const output: number[] = [];
  let zeroCount = 0;
  for (const byte of data) {
    if (
      zeroCount >= H264_EMULATION_PREVENTION_LAYOUT.precedingZeroBytes &&
      byte === H264_EMULATION_PREVENTION_LAYOUT.preventionByte
    ) {
      zeroCount = 0;
      continue;
    }
    output.push(byte);
    zeroCount = byte === 0 ? zeroCount + 1 : 0;
  }
  return Buffer.from(output);
}
