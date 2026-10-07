import { ByteQueue } from './byte-queue.class.js';
import { RtspParseError } from './rtsp-parse-error.class.js';
import { type RtspParserLimits } from './rtsp-parser-limits.interface.js';

import { HEADER_TERMINATOR } from './header-terminator.constant.js';
import type { RtspMessage } from './rtsp-message.interface.js';
import { parseHeaderBlock } from './parse-header-block.util.js';

export function tryReadRtspMessage(
  queue: ByteQueue,
  limits: RtspParserLimits,
): RtspMessage | undefined {
  if (queue.length === 0) {
    return undefined;
  }

  if (queue.peekByte(0) === 0x24) {
    throw new RtspParseError(
      'unexpected_interleaved_frame',
      'An interleaved frame was passed to an RTSP message-only parser.',
    );
  }

  const headerEnd = queue.indexOf(HEADER_TERMINATOR, limits.maxHeaderBytes);
  if (headerEnd < 0) {
    if (queue.length > limits.maxHeaderBytes) {
      throw new RtspParseError(
        'rtsp_header_too_large',
        `RTSP header exceeds the ${limits.maxHeaderBytes} byte limit.`,
      );
    }
    return undefined;
  }

  const headerLength = headerEnd + HEADER_TERMINATOR.length;
  if (headerLength > limits.maxHeaderBytes) {
    throw new RtspParseError(
      'rtsp_header_too_large',
      `RTSP header exceeds the ${limits.maxHeaderBytes} byte limit.`,
    );
  }

  const rawHeader = queue.peek(headerLength);
  const parsed = parseHeaderBlock(rawHeader, limits);
  const messageLength = headerLength + parsed.contentLength;
  if (queue.length < messageLength) {
    return undefined;
  }

  queue.discard(headerLength);
  const body = queue.read(parsed.contentLength);
  return {
    type: 'rtsp-message',
    startLine: parsed.startLine,
    headers: parsed.headers,
    body,
    rawHeader,
  };
}
