import { ByteQueue } from './byte-queue.class.js';
import { RTSP_INTERLEAVED_MAGIC } from './rtsp-interleaved-magic.constant.js';
import { tryReadInterleavedFrame } from './try-read-interleaved-frame.util.js';
import { tryReadRtspMessage } from './try-read-rtsp-message.util.js';
import { RtspParseError } from './rtsp-parse-error.class.js';
import { resolveRtspParserLimits } from './resolve-rtsp-parser-limits.util.js';
import { type RtspParserLimits } from './rtsp-parser-limits.interface.js';

import type { RtspStreamItem } from './rtsp-stream-item.type.js';

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
