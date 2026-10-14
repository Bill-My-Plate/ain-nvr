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
/**
 * Incrementally parses RTSP messages and interleaved media frames from TCP bytes.
 */
export class RtspParser {
  private readonly queue = new ByteQueue();
  private readonly limits: RtspParserLimits;
  public readonly mode: RtspParserMode;
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(options: RtspParserOptions = {}) {
    const mode = options.mode ?? 'mixed';
    if (mode !== 'mixed' && mode !== 'message' && mode !== 'interleaved') {
      throw new RangeError('Invalid RTSP parser mode.');
    }
    this.mode = mode;
    this.limits = resolveRtspParserLimits(options);
  }

  /**
   * Returns the number of unread bytes retained for a partial item.
   */
  public get bufferedBytes(): number {
    return this.queue.length;
  }

  /**
   * Appends a TCP chunk and emits every complete RTSP message or interleaved frame now available.
   * @param chunk Arbitrary RTSP TCP bytes. Messages have a start line and CRLF-delimited headers; interleaved frames have `$`, a channel byte, a two-byte big-endian length, then that many payload bytes. A chunk may split either format.
   */
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

  /**
   * Rejects trailing bytes when the input ends inside an incomplete RTSP item.
   */
  public finish(): void {
    if (this.queue.length > 0) {
      const input =
        this.mode === 'mixed' ? 'Mixed RTSP' : this.mode === 'message' ? 'RTSP' : 'Interleaved';
      throw new RtspParseError(
        'incomplete_input',
        `${input} input ended with ${this.queue.length} buffered bytes.`,
      );
    }
  }

  /**
   * Clears accumulated state for a new stream or operation.
   */
  public reset(): void {
    this.queue.clear();
  }

  /**
   * Reads one complete RTSP item from the queued bytes when available.
   */
  private readNext(): RtspStreamItem | undefined {
    if (this.mode === 'message') {
      return tryReadRtspMessage(this.queue, this.limits);
    }
    if (this.mode === 'interleaved' || this.queue.peekByte(0) === RTSP_INTERLEAVED_MAGIC) {
      return tryReadInterleavedFrame(this.queue, this.limits);
    }
    return tryReadRtspMessage(this.queue, this.limits);
  }
}
