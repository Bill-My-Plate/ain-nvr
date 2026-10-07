
import { RtspParseError } from '../errors/rtsp-parse-error.class.js';


import type { RtspStartLine } from '../types/rtsp-start-line.type.js';

export function parseStartLine(value: string): RtspStartLine {
  const response = /^RTSP\/(\d+\.\d+) ([0-9]{3})(?: (.*))?$/u.exec(value);
  if (response !== null) {
    const statusCode = Number(response[2]);
    return {
      type: 'response',
      version: `RTSP/${response[1]}`,
      statusCode,
      statusMessage: response[3] ?? '',
    };
  }

  const request = /^([A-Z][A-Z0-9_-]*) (\S+) RTSP\/(\d+\.\d+)$/u.exec(value);
  if (request !== null) {
    return {
      type: 'request',
      method: request[1] ?? '',
      uri: request[2] ?? '',
      version: `RTSP/${request[3]}`,
    };
  }

  throw new RtspParseError(
    'invalid_rtsp_start_line',
    'Invalid RTSP request or response start line.',
  );
}
