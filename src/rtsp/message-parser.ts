import { ByteQueue } from './byte-queue.js';
import { RtspParseError } from './parse-error.js';
import {
  resolveRtspParserLimits,
  type RtspParserLimits,
} from './parser-limits.js';

const HEADER_TERMINATOR = Buffer.from('\r\n\r\n', 'ascii');
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const CONTENT_LENGTH_PATTERN = /^[0-9]+$/u;

export interface RtspRequestLine {
  readonly type: 'request';
  readonly method: string;
  readonly uri: string;
  readonly version: string;
}

export interface RtspResponseLine {
  readonly type: 'response';
  readonly version: string;
  readonly statusCode: number;
  readonly statusMessage: string;
}

export type RtspStartLine = RtspRequestLine | RtspResponseLine;

export interface RtspMessage {
  readonly type: 'rtsp-message';
  readonly startLine: RtspStartLine;
  readonly headers: ReadonlyMap<string, string>;
  readonly body: Buffer;
  readonly rawHeader: Buffer;
}

interface ParsedHeader {
  readonly startLine: RtspStartLine;
  readonly headers: ReadonlyMap<string, string>;
  readonly contentLength: number;
}

function parseStartLine(value: string): RtspStartLine {
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

function parseHeaderBlock(
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

export function getRtspHeader(
  message: RtspMessage,
  name: string,
): string | undefined {
  return message.headers.get(name.toLowerCase());
}

export class RtspMessageParser {
  private readonly queue = new ByteQueue();
  private readonly limits: RtspParserLimits;

  constructor(limits: Partial<RtspParserLimits> = {}) {
    this.limits = resolveRtspParserLimits(limits);
  }

  get bufferedBytes(): number {
    return this.queue.length;
  }

  push(chunk: Buffer): RtspMessage[] {
    this.queue.push(chunk);
    const messages: RtspMessage[] = [];

    while (this.queue.length > 0) {
      const message = tryReadRtspMessage(this.queue, this.limits);
      if (message === undefined) {
        break;
      }
      messages.push(message);
    }

    return messages;
  }

  finish(): void {
    if (this.queue.length > 0) {
      throw new RtspParseError(
        'incomplete_input',
        `RTSP input ended with ${this.queue.length} buffered bytes.`,
      );
    }
  }

  reset(): void {
    this.queue.clear();
  }
}
