import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
/**
 * Computes signed distance across the 32-bit RTP timestamp wrap.
 */
export function signedTimestampDelta(current: number, previous: number): number {
  let delta = current - previous;
  if (delta > STREAM_ADAPTER_CONSTANTS.rtpTimestampHalfRange)
    delta -= STREAM_ADAPTER_CONSTANTS.rtpTimestampRange;
  else if (delta < -STREAM_ADAPTER_CONSTANTS.rtpTimestampHalfRange)
    delta += STREAM_ADAPTER_CONSTANTS.rtpTimestampRange;
  return delta;
}
