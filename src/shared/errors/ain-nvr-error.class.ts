import type { AinNvrErrorCode } from "../types/ain-nvr-error-code.type.js";

export class AinNvrError extends Error {
  override name: string = "AinNvrError";

  constructor(
    readonly code: AinNvrErrorCode,
    message: string,
    options: {
      cause?: unknown;
      details?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.details = options.details;
  }

  details: Readonly<Record<string, unknown>> | undefined;
}
