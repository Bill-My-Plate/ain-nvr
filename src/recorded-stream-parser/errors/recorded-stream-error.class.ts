import { AinNvrError } from '../../shared/index.js';
/**
 * Reports malformed or truncated stored interleaved media.
 */
export class RecordedStreamError extends AinNvrError {
  override readonly name = 'RecordedStreamError';
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(
    message: string,
    options: {
      /** Original failure that caused this error. */
      readonly cause?: unknown;
    } = {},
  ) {
    super('corrupt_media', message, options);
  }
}
