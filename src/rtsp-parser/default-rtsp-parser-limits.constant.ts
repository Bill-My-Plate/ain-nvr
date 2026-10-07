import type { RtspParserLimits } from './rtsp-parser-limits.interface.js';

export const DEFAULT_RTSP_PARSER_LIMITS: RtspParserLimits = Object.freeze({
  maxHeaderBytes: 32 * 1024,
  maxBodyBytes: 1024 * 1024,
  maxInterleavedPacketBytes: 65_535,
});
