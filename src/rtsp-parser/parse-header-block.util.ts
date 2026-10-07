
import { RtspParseError } from './rtsp-parse-error.class.js';
import { type RtspParserLimits } from './rtsp-parser-limits.interface.js';

import { HEADER_TERMINATOR } from './header-terminator.constant.js';
import { HEADER_NAME_PATTERN } from './header-name-pattern.constant.js';
import { CONTENT_LENGTH_PATTERN } from './content-length-pattern.constant.js';
import type { ParsedHeader } from './parsed-header.type.js';
import { parseStartLine } from './parse-start-line.util.js';

export function parseHeaderBlock(
  rawHeader: Buffer,
  limits: RtspParserLimits,
): ParsedHeader {
  const text = rawHeader.subarray(0, rawHeader.length - HEADER_TERMINATOR.length)
    .toString('latin1');
  const lines = text.split('\r\n');
  const rawStartLine = lines.shift();
  if (!rawStartLine) {
    throw new RtspParseError(
      'invalid_rtsp_start_line',
      'RTSP start line is empty.',
    );
  }

  const startLine = parseStartLine(rawStartLine);
  const headers = new Map<string, string>();

  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator <= 0) {
      throw new RtspParseError(
        'invalid_rtsp_header',
        'RTSP header line is malformed.',
      );
    }

    const originalName = line.slice(0, separator).trim();
    if (!HEADER_NAME_PATTERN.test(originalName)) {
      throw new RtspParseError(
        'invalid_rtsp_header',
        'RTSP header name is malformed.',
      );
    }

    const name = originalName.toLowerCase();
    const value = line.slice(separator + 1).trim();
    const previous = headers.get(name);
    headers.set(name, previous === undefined ? value : `${previous}, ${value}`);
  }

  const rawContentLength = headers.get('content-length');
  if (rawContentLength === undefined) {
    return { startLine, headers, contentLength: 0 };
  }

  if (!CONTENT_LENGTH_PATTERN.test(rawContentLength)) {
    throw new RtspParseError(
      'invalid_content_length',
      'RTSP Content-Length must be a non-negative decimal integer.',
    );
  }

  const contentLength = Number(rawContentLength);
  if (!Number.isSafeInteger(contentLength)) {
    throw new RtspParseError(
      'invalid_content_length',
      'RTSP Content-Length is outside the safe integer range.',
    );
  }

  if (contentLength > limits.maxBodyBytes) {
    throw new RtspParseError(
      'rtsp_body_too_large',
      `RTSP body exceeds the ${limits.maxBodyBytes} byte limit.`,
    );
  }

  return { startLine, headers, contentLength };
}
