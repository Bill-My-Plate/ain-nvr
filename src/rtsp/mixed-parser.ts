import { ByteQueue } from './byte-queue.js';
import {
  RTSP_INTERLEAVED_MAGIC,
  tryReadInterleavedFrame,
  type RtspInterleavedFrame,
} from './interleaved-parser.js';
import { tryReadRtspMessage, type RtspMessage } from './message-parser.js';
import { RtspParseError } from './parse-error.js';
import {
  resolveRtspParserLimits,
  type RtspParserLimits,
} from './parser-limits.js';

export type RtspStreamItem = RtspMessage | RtspInterleavedFrame;

export class RtspMixedParser {
  private readonly queue = new ByteQueue();
  private readonly limits: RtspParserLimits;

  constructor(limits: Partial<RtspParserLimits> = {}) {
    this.limits = resolveRtspParserLimits(limits);
  }

  get bufferedBytes(): number {
    return this.queue.length;
  }

  push(chunk: Buffer): RtspStreamItem[] {
    this.queue.push(chunk);
    const items: RtspStreamItem[] = [];

    while (this.queue.length > 0) {
      const item = this.queue.peekByte(0) === RTSP_INTERLEAVED_MAGIC
        ? tryReadInterleavedFrame(this.queue, this.limits)
        : tryReadRtspMessage(this.queue, this.limits);

      if (item === undefined) {
        break;
      }
      items.push(item);
    }

    return items;
  }

  finish(): void {
    if (this.queue.length > 0) {
      throw new RtspParseError(
        'incomplete_input',
        `Mixed RTSP input ended with ${this.queue.length} buffered bytes.`,
      );
    }
  }

  reset(): void {
    this.queue.clear();
  }
}
