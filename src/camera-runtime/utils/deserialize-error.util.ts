import type { WireError } from '../types/wire-error.type.js';
/**
 * Reconstructs an Error from a worker-safe serialized message.
 */
export function deserializeError(error: WireError): Error {
  return Object.assign(
    new Error(error.message),
    error.code === undefined ? {} : { code: error.code },
  );
}
