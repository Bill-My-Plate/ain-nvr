


import type { WireError } from '../types/wire-error.type.js';
import { asError } from './as-error.util.js';

export function serializeError(error: unknown): WireError {
  const e = asError(error);
  let cause: unknown = e;
  let code: string | undefined;
  for (let depth = 0; depth < 8 && cause instanceof Error; depth++) {
    const value = (cause as NodeJS.ErrnoException).code;
    if (typeof value === 'string') code = value;
    // RtspClientError carries HTTP-like statusCode, not an AinNvrError code.
    const status = (cause as Error & { statusCode?: number }).statusCode;
    if (status === 401 || status === 403) code = 'rtsp_authentication_failed';
    else if (status === 461) code = 'rtsp_unsupported_transport';
    else if (status === 404) code = 'EINVAL';
    cause = cause.cause;
  }
  return { message: e.message.slice(0, 2_048), ...(code === undefined ? {} : { code }) };
}
