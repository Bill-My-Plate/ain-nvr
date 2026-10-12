import { RTP_MODULUS } from '../constants/rtp-modulus.constant.js';
import { RTP_HALF_MODULUS } from '../constants/rtp-half-modulus.constant.js';
import { RTP_TIMESTAMP_MAX } from '../constants/rtp-timestamp-max.constant.js';

/**
 * Extend wrapping 32-bit RTP timestamps into a bigint timeline.
 * Each change is interpreted as the shortest signed distance between timestamps;
 * gaps of half the timestamp range or more have an ambiguous direction.
 */
export class RtpTimestampUnwrapper {
  private lastRaw: number | undefined;
  private lastUnwrapped: bigint | undefined;

  /** Return an extended timestamp using the previous value to resolve wraparound. */
  public unwrap(timestamp: number): bigint {
    if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp > RTP_TIMESTAMP_MAX) {
      throw new RangeError('RTP timestamp must be an unsigned 32-bit integer.');
    }
    if (this.lastRaw === undefined || this.lastUnwrapped === undefined) {
      // The first value anchors the unwrapped timeline.
      this.lastRaw = timestamp;
      this.lastUnwrapped = BigInt(timestamp);
      return this.lastUnwrapped;
    }

    let delta = timestamp - this.lastRaw;
    if (delta > RTP_HALF_MODULUS) {
      // A large apparent increase is a small backward move across zero.
      delta -= RTP_MODULUS;
    } else if (delta < -RTP_HALF_MODULUS) {
      // A large apparent decrease is a forward wrap past the 32-bit maximum.
      delta += RTP_MODULUS;
    }

    this.lastRaw = timestamp;
    this.lastUnwrapped += BigInt(delta);
    return this.lastUnwrapped;
  }

  /** Discard the timestamp anchor before processing a new stream or discontinuity. */
  public reset(): void {
    this.lastRaw = undefined;
    this.lastUnwrapped = undefined;
  }
}
