import { RECORDED_STREAM_CONSTANTS } from '../constants/recorded-stream-parser-numeric-values.constant.js';
/**
 * Computes the shortest signed distance between two wrapping 32-bit RTP timestamps.
 */
export function signedTimestampDelta(timestamp: number, anchor: number): number {
  let delta = timestamp - anchor;
  if (delta > RECORDED_STREAM_CONSTANTS.rtpTimestampHalfRange)
    delta -= RECORDED_STREAM_CONSTANTS.rtpTimestampRange;
  else if (delta < -RECORDED_STREAM_CONSTANTS.rtpTimestampHalfRange)
    delta += RECORDED_STREAM_CONSTANTS.rtpTimestampRange;
  return delta;
}
