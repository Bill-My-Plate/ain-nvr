import { H264PayloadError } from './h264-payload-error.class.js';

export function validateNalHeader(header: number): void {
  if ((header & 0x80) !== 0) {
    throw new H264PayloadError('H.264 forbidden_zero_bit is set.');
  }
}
