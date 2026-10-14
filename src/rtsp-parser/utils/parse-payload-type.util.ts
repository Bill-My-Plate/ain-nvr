import { RTSP_PARSER_CONSTANTS } from '../constants/rtsp-parser-numeric-values.constant.js';
/**
 * Validates and returns an RTP payload type number from SDP.
 */
export function parsePayloadType(value: string, field: string): number {
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < 0 ||
    parsed > RTSP_PARSER_CONSTANTS.maximumRtpPayloadType
  ) {
    throw new Error(`Invalid SDP payload type in ${field}.`);
  }
  return parsed;
}
