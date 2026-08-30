const RTP_MODULUS = 0x1_0000_0000;
const RTP_HALF_MODULUS = 0x8000_0000;

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

export function rtpTicksToMicroseconds(ticks: bigint, clockRate: number): bigint {
  if (!Number.isInteger(clockRate) || clockRate <= 0) {
    throw new RangeError('RTP clock rate must be a positive integer.');
  }
  return ticks * 1_000_000n / BigInt(clockRate);
}

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
