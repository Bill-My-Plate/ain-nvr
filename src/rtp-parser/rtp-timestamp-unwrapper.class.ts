import { RTP_MODULUS } from './rtp-modulus.constant.js';
import { RTP_HALF_MODULUS } from './rtp-half-modulus.constant.js';

export class RtpTimestampUnwrapper {
  private lastRaw: number | undefined;
  private lastUnwrapped: bigint | undefined;

  unwrap(timestamp: number): bigint {
    if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp > 0xffff_ffff) {
      throw new RangeError('RTP timestamp must be an unsigned 32-bit integer.');
    }
    if (this.lastRaw === undefined || this.lastUnwrapped === undefined) {
      this.lastRaw = timestamp;
      this.lastUnwrapped = BigInt(timestamp);
      return this.lastUnwrapped;
    }

    let delta = timestamp - this.lastRaw;
    if (delta > RTP_HALF_MODULUS) {
      delta -= RTP_MODULUS;
    } else if (delta < -RTP_HALF_MODULUS) {
      delta += RTP_MODULUS;
    }

    this.lastRaw = timestamp;
    this.lastUnwrapped += BigInt(delta);
    return this.lastUnwrapped;
  }

  reset(): void {
    this.lastRaw = undefined;
    this.lastUnwrapped = undefined;
  }
}
