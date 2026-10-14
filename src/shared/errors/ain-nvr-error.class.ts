import type { AinNvrErrorCode } from '../types/ain-nvr-error-code.type.js';
/**
 * Base coded error shared by ain-nvr modules.
 */
export class AinNvrError extends Error {
  override name: string = 'AinNvrError';
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(
    readonly code: AinNvrErrorCode,
    message: string,
    options: {
      /** Original failure that caused this error. */
      cause?: unknown;

      /** Structured diagnostic fields associated with this error. */
      details?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.details = options.details;
  }

  details: Readonly<Record<string, unknown>> | undefined;
}
