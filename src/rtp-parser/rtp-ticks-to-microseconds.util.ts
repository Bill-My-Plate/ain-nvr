export function rtpTicksToMicroseconds(ticks: bigint, clockRate: number): bigint {
  if (!Number.isInteger(clockRate) || clockRate <= 0) {
    throw new RangeError('RTP clock rate must be a positive integer.');
  }
  return ticks * 1_000_000n / BigInt(clockRate);
}
