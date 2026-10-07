import { NANOSECONDS_PER_SECOND } from '../constants/nanoseconds-per-second.constant.js';

export class FrameSampler {
  private readonly intervalNanoseconds: bigint;
  private lastCaptureNanoseconds: bigint | undefined;

  constructor(framesPerSecond: number) {
    if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0 || framesPerSecond > 60) {
      throw new Error('framesPerSecond must be greater than 0 and at most 60.');
    }
    this.intervalNanoseconds = BigInt(
      Math.max(1, Math.floor(NANOSECONDS_PER_SECOND / framesPerSecond)),
    );
  }

  shouldCapture(nowNanoseconds: bigint): boolean {
    if (
      this.lastCaptureNanoseconds !== undefined
      && nowNanoseconds - this.lastCaptureNanoseconds < this.intervalNanoseconds
    ) {
      return false;
    }

    this.lastCaptureNanoseconds = nowNanoseconds;
    return true;
  }
}
