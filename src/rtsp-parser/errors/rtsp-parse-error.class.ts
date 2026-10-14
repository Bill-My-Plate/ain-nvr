import type { RtspParseErrorCode } from '../types/rtsp-parse-error-code.type.js';
/**
 * Reports invalid RTSP messages or interleaved frames with a parse code.
 */
export class RtspParseError extends Error {
  override readonly name = 'RtspParseError';
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(
    readonly code: RtspParseErrorCode,
    message: string,
  ) {
    super(message);
  }
}
