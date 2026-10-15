/**
 * Converts an unknown thrown value into an Error instance.
 */
export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
