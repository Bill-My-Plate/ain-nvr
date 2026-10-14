import { FRAME_EXTRACTOR_CONSTANTS } from '../constants/frame-extractor-numeric-values.constant.js';
import { NANOSECONDS_PER_SECOND } from '../constants/nanoseconds-per-second.constant.js';
/**
 * Selects decoded frames at the requested sampling rate using monotonic time.
 */
export class FrameSampler {
  private readonly intervalNanoseconds: bigint;
  private lastCaptureNanoseconds: bigint | undefined;
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(framesPerSecond: number) {
    if (
      !Number.isFinite(framesPerSecond) ||
      framesPerSecond <= 0 ||
      framesPerSecond > FRAME_EXTRACTOR_CONSTANTS.maximumFramesPerSecond
    ) {
      throw new Error('framesPerSecond must be greater than 0 and at most 60.');
    }
    this.intervalNanoseconds = BigInt(
      Math.max(1, Math.floor(NANOSECONDS_PER_SECOND / framesPerSecond)),
    );
  }

  /**
   * Checks whether capture.
   */
  public shouldCapture(nowNanoseconds: bigint): boolean {
    if (
      this.lastCaptureNanoseconds !== undefined &&
      nowNanoseconds - this.lastCaptureNanoseconds < this.intervalNanoseconds
    ) {
      return false;
    }

    this.lastCaptureNanoseconds = nowNanoseconds;
    return true;
  }
}
