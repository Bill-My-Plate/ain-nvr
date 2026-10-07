import { rtpTicksToMicroseconds } from '../utils/rtp-ticks-to-microseconds.util.js';

export class RtpClockMapper {
  constructor(
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

  toWallClockMs(timestamp: bigint): number {
    const deltaUs = rtpTicksToMicroseconds(timestamp - this.anchorTimestamp, this.clockRate);
    return this.anchorTimeMs + Number(deltaUs) / 1000;
  }
}
