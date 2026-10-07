import { ByteQueue } from './byte-queue.class.js';
import { RtspParseError } from '../errors/rtsp-parse-error.class.js';
import { resolveRtspParserLimits } from '../utils/resolve-rtsp-parser-limits.util.js';
import { type RtspParserLimits } from '../types/rtsp-parser-limits.interface.js';

import type { RtspMessage } from '../types/rtsp-message.interface.js';
import { tryReadRtspMessage } from '../utils/try-read-rtsp-message.util.js';

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
