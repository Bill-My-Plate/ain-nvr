import type { AinNvrErrorCode } from '../types/ain-nvr-error-code.type.js';

export class AinNvrError extends Error {
  override readonly name: string = 'AinNvrError';

  constructor(
    readonly code: AinNvrErrorCode,
    message: string,
    options: {
      readonly cause?: unknown;
      readonly details?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.details = options.details;
  }

  readonly details: Readonly<Record<string, unknown>> | undefined;
}
