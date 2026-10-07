


import type { WireError } from './wire-error.type.js';

export function deserializeError(error: WireError): Error {
  return Object.assign(new Error(error.message), error.code === undefined ? {} : { code: error.code });
}
