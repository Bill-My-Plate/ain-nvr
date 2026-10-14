import { RTSP_PARSER_CONSTANTS } from '../constants/rtsp-parser-numeric-values.constant.js';
import { RtspParseError } from '../errors/rtsp-parse-error.class.js';

import type { RtspStartLine } from '../types/rtsp-start-line.type.js';
/**
 * Parses an RTSP request or response start line.
 */
export function parseStartLine(value: string): RtspStartLine {
  const response = /^RTSP\/(\d+\.\d+) ([0-9]{3})(?: (.*))?$/u.exec(value);
  if (response !== null) {
    const statusCode = Number(response[RTSP_PARSER_CONSTANTS.rtspStatusCodeGroup]);
    return {
      type: 'response',
      version: `RTSP/${response[1]}`,
      statusCode,
      statusMessage: response[RTSP_PARSER_CONSTANTS.rtspStatusMessageGroup] ?? '',
    };
  }

  const request = /^([A-Z][A-Z0-9_-]*) (\S+) RTSP\/(\d+\.\d+)$/u.exec(value);
  if (request !== null) {
    return {
      type: 'request',
      method: request[1] ?? '',
      uri: request[RTSP_PARSER_CONSTANTS.rtspRequestUriGroup] ?? '',
      version: `RTSP/${request[RTSP_PARSER_CONSTANTS.rtspRequestVersionGroup]}`,
    };
  }

  throw new RtspParseError(
    'invalid_rtsp_start_line',
    'Invalid RTSP request or response start line.',
  );
}
