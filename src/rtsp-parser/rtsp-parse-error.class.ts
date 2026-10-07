import type { RtspParseErrorCode } from './rtsp-parse-error-code.type.js';

export class RtspParseError extends Error {
  override readonly name = 'RtspParseError';

  constructor(
    readonly code: RtspParseErrorCode,
    message: string,
  ) {
    super(message);
  }
}
