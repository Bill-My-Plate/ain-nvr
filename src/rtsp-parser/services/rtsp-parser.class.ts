import { RTSP_INTERLEAVED_MAGIC } from '../constants/rtsp-interleaved-magic.constant.js';
import { RtspParseError } from '../errors/rtsp-parse-error.class.js';
import type { RtspParserLimits } from '../types/rtsp-parser-limits.interface.js';
import type { RtspParserMode } from '../types/rtsp-parser-mode.type.js';
import type { RtspParserOptions } from '../types/rtsp-parser-options.type.js';
import type { RtspStreamItem } from '../types/rtsp-stream-item.type.js';
import { resolveRtspParserLimits } from '../utils/resolve-rtsp-parser-limits.util.js';
import { tryReadInterleavedFrame } from '../utils/try-read-interleaved-frame.util.js';
import { tryReadRtspMessage } from '../utils/try-read-rtsp-message.util.js';
import { ByteQueue } from './byte-queue.class.js';

export class RtspParser {
  private readonly queue = new ByteQueue();
  private readonly limits: RtspParserLimits;
  public readonly mode: RtspParserMode;

  constructor(options: RtspParserOptions = {}) {
    const mode = options.mode ?? 'mixed';
    if (mode !== 'mixed' && mode !== 'message' && mode !== 'interleaved') {
      throw new RangeError('Invalid RTSP parser mode.');
    }
    this.mode = mode;
    this.limits = resolveRtspParserLimits(options);
  }

  public get bufferedBytes(): number {
    return this.queue.length;
  }

  public push(chunk: Buffer): RtspStreamItem[] {
    this.queue.push(chunk);
    const items: RtspStreamItem[] = [];

    while (this.queue.length > 0) {
      const item = this.readNext();
      if (item === undefined) {
        break;
      }
      items.push(item);
    }

    return items;
  }

  public finish(): void {
    if (this.queue.length > 0) {
      const input = this.mode === 'mixed' ? 'Mixed RTSP'
        : this.mode === 'message' ? 'RTSP' : 'Interleaved';
      throw new RtspParseError(
        'incomplete_input',
        `${input} input ended with ${this.queue.length} buffered bytes.`,
      );
    }
  }

  public reset(): void {
    this.queue.clear();
  }

  private readNext(): RtspStreamItem | undefined {
    if (this.mode === 'message') {
      return tryReadRtspMessage(this.queue, this.limits);
    }
    if (this.mode === 'interleaved'
      || this.queue.peekByte(0) === RTSP_INTERLEAVED_MAGIC) {
      return tryReadInterleavedFrame(this.queue, this.limits);
    }
    return tryReadRtspMessage(this.queue, this.limits);
  }
}
