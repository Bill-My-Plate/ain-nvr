import { H264PayloadError } from '../errors/h264-payload-error.class.js';
import { H264_NAL_LAYOUT } from '../constants/h264-nal-layout.constant.js';

/** Reject a NAL header byte with the H.264 forbidden_zero_bit set. */
export function validateNalHeader(header: number): void {
  if ((header & H264_NAL_LAYOUT.forbiddenZeroBitMask) !== 0) {
    throw new H264PayloadError('H.264 forbidden_zero_bit is set.');
  }
}
