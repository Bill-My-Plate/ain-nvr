import { H264_NAL_LAYOUT } from '../constants/h264-nal-layout.constant.js';
/**
 * Check a raw NAL's first byte for a clear forbidden bit and the requested type.
 * @param nal A complete H.264 NAL; its first byte holds the forbidden bit and five-bit NAL type. Further bytes contain variable-length NAL data.
 */
export function validNal(nal: Buffer, expectedType: number): boolean {
  const header = nal[H264_NAL_LAYOUT.headerByteOffset];
  return (
    header !== undefined &&
    (header & H264_NAL_LAYOUT.forbiddenZeroBitMask) === 0 &&
    (header & H264_NAL_LAYOUT.typeMask) === expectedType
  );
}
