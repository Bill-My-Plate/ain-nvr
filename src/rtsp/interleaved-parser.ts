import { ByteQueue } from './byte-queue.js';
import { RtspParseError } from './parse-error.js';
import {
  resolveRtspParserLimits,
  type RtspParserLimits,
} from './parser-limits.js';

export const RTSP_INTERLEAVED_MAGIC = 0x24;
const INTERLEAVED_HEADER_LENGTH = 4;

export interface RtspInterleavedFrame {
  readonly type: 'interleaved-frame';
  readonly channel: number;
  readonly payload: Buffer;
  readonly rawHeader: Buffer;
}

export function tryReadInterleavedFrame(
  queue: ByteQueue,
  limits: RtspParserLimits,
): RtspInterleavedFrame | undefined {
  if (queue.length === 0) {
    return undefined;
  }

  if (queue.peekByte(0) !== RTSP_INTERLEAVED_MAGIC) {
    throw new RtspParseError(
      'invalid_interleaved_magic',
      'Interleaved frame does not begin with the $ marker.',
    );
  }

  if (queue.length < INTERLEAVED_HEADER_LENGTH) {
    return undefined;
  }

  const rawHeader = queue.peek(INTERLEAVED_HEADER_LENGTH);
  const channel = rawHeader.readUInt8(1);
  const payloadLength = rawHeader.readUInt16BE(2);

  if (payloadLength === 0) {
    throw new RtspParseError(
      'invalid_interleaved_length',
      'Interleaved packet length must be greater than zero.',
    );
  }

  if (payloadLength > limits.maxInterleavedPacketBytes) {
    throw new RtspParseError(
      'interleaved_packet_too_large',
      `Interleaved packet exceeds the ${limits.maxInterleavedPacketBytes} byte limit.`,
    );
  }

  if (queue.length < INTERLEAVED_HEADER_LENGTH + payloadLength) {
    return undefined;
  }

  queue.discard(INTERLEAVED_HEADER_LENGTH);
  const payload = queue.read(payloadLength);
  return {
    type: 'interleaved-frame',
    channel,
    payload,
    rawHeader,
  };
}

export class RtspInterleavedParser {
  private readonly queue = new ByteQueue();
  private readonly limits: RtspParserLimits;

  constructor(limits: Partial<RtspParserLimits> = {}) {
    this.limits = resolveRtspParserLimits(limits);
  }

  get bufferedBytes(): number {
    return this.queue.length;
  }

  push(chunk: Buffer): RtspInterleavedFrame[] {
    this.queue.push(chunk);
    const frames: RtspInterleavedFrame[] = [];

    while (this.queue.length > 0) {
      const frame = tryReadInterleavedFrame(this.queue, this.limits);
      if (frame === undefined) {
        break;
      }
      frames.push(frame);
    }

    return frames;
  }

  finish(): void {
    if (this.queue.length > 0) {
      throw new RtspParseError(
        'incomplete_input',
        `Interleaved input ended with ${this.queue.length} buffered bytes.`,
      );
    }
  }

  reset(): void {
    this.queue.clear();
  }
}
