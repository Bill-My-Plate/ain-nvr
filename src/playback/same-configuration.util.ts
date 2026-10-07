import type { H264CodecConfiguration } from '../h264/index.js';





export function sameConfiguration(
  left: H264CodecConfiguration | undefined,
  right: H264CodecConfiguration,
): boolean {
  return left?.decoder.codec === right.decoder.codec
    && left.sps.equals(right.sps)
    && left.pps.equals(right.pps);
}
