import { RTSP_PARSER_CONSTANTS } from '../constants/rtsp-parser-numeric-values.constant.js';
import type { RtspParserLimits } from '../types/rtsp-parser-limits.interface.js';
import { DEFAULT_RTSP_PARSER_LIMITS } from '../constants/default-rtsp-parser-limits.constant.js';
import { requireIntegerInRange } from './require-integer-in-range.util.js';
/**
 * Validates RTSP byte limits and fills in defaults.
 */
export function resolveRtspParserLimits(limits: Partial<RtspParserLimits> = {}): RtspParserLimits {
  return Object.freeze({
    maxHeaderBytes: requireIntegerInRange(
      'maxHeaderBytes',
      limits.maxHeaderBytes ?? DEFAULT_RTSP_PARSER_LIMITS.maxHeaderBytes,
      RTSP_PARSER_CONSTANTS.minimumHeaderTerminatorBytes,
      RTSP_PARSER_CONSTANTS.maximumHeaderBytes,
    ),
    maxBodyBytes: requireIntegerInRange(
      'maxBodyBytes',
      limits.maxBodyBytes ?? DEFAULT_RTSP_PARSER_LIMITS.maxBodyBytes,
      0,
      RTSP_PARSER_CONSTANTS.maximumBodyBytes,
    ),
    maxInterleavedPacketBytes: requireIntegerInRange(
      'maxInterleavedPacketBytes',
      limits.maxInterleavedPacketBytes ?? DEFAULT_RTSP_PARSER_LIMITS.maxInterleavedPacketBytes,
      1,
      RTSP_PARSER_CONSTANTS.maximumInterleavedPayloadBytes,
    ),
  });
}
