import { RTP_PARSER_CONSTANTS } from '../constants/rtp-parser-numeric-values.constant.js';
import { rtpTicksToMicroseconds } from '../utils/rtp-ticks-to-microseconds.util.js';
/**
 * Converts unwrapped RTP ticks to Unix milliseconds using a trusted clock anchor.
 */
export class RtpClockMapper {
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(
    readonly anchorTimestamp: bigint,
    readonly anchorTimeMs: number,
    readonly clockRate: number,
  ) {
    if (!Number.isFinite(anchorTimeMs)) {
      throw new RangeError('RTP anchor time must be finite.');
    }
    if (!Number.isInteger(clockRate) || clockRate <= 0) {
      throw new RangeError('RTP clock rate must be a positive integer.');
    }
  }

  /**
   * Converts the value to wall Clock Ms.
   */
  public toWallClockMs(timestamp: bigint): number {
    const deltaUs = rtpTicksToMicroseconds(timestamp - this.anchorTimestamp, this.clockRate);
    return this.anchorTimeMs + Number(deltaUs) / RTP_PARSER_CONSTANTS.microsecondsPerMillisecond;
  }
}
