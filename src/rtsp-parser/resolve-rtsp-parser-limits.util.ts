import type { RtspParserLimits } from './rtsp-parser-limits.interface.js';
import { DEFAULT_RTSP_PARSER_LIMITS } from './default-rtsp-parser-limits.constant.js';
import { requireIntegerInRange } from './require-integer-in-range.util.js';

export function resolveRtspParserLimits(
  limits: Partial<RtspParserLimits> = {},
): RtspParserLimits {
  return Object.freeze({
    maxHeaderBytes: requireIntegerInRange(
      'maxHeaderBytes',
      limits.maxHeaderBytes ?? DEFAULT_RTSP_PARSER_LIMITS.maxHeaderBytes,
      4,
      16 * 1024 * 1024,
    ),
    maxBodyBytes: requireIntegerInRange(
      'maxBodyBytes',
      limits.maxBodyBytes ?? DEFAULT_RTSP_PARSER_LIMITS.maxBodyBytes,
      0,
      64 * 1024 * 1024,
    ),
    maxInterleavedPacketBytes: requireIntegerInRange(
      'maxInterleavedPacketBytes',
      limits.maxInterleavedPacketBytes
        ?? DEFAULT_RTSP_PARSER_LIMITS.maxInterleavedPacketBytes,
      1,
      65_535,
    ),
  });
}
