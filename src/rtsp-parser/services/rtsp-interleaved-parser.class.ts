import { ByteQueue } from './byte-queue.class.js';
import { RtspParseError } from '../errors/rtsp-parse-error.class.js';
import { resolveRtspParserLimits } from '../utils/resolve-rtsp-parser-limits.util.js';
import { type RtspParserLimits } from '../types/rtsp-parser-limits.interface.js';

import type { RtspInterleavedFrame } from '../types/rtsp-interleaved-frame.interface.js';
import { tryReadInterleavedFrame } from '../utils/try-read-interleaved-frame.util.js';

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
