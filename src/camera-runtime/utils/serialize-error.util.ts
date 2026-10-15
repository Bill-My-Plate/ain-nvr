import { CAMERA_RUNTIME_CONSTANTS } from '../constants/camera-runtime-numeric-values.constant.js';
import type { WireError } from '../types/wire-error.type.js';
import { asError } from '../../shared/index.js';
/**
 * Converts an Error and nested causes to bounded worker-safe data.
 */
export function serializeError(error: unknown): WireError {
  const e = asError(error);
  let cause: unknown = e;
  let code: string | undefined;
  for (
    let depth = 0;
    depth < CAMERA_RUNTIME_CONSTANTS.maximumErrorCauseDepth && cause instanceof Error;
    depth++
  ) {
    const value = (cause as NodeJS.ErrnoException).code;
    if (typeof value === 'string') code = value;
    // RtspClientError carries HTTP-like statusCode, not an AinNvrError code.
    const status = (
      cause as Error & {
        /** RTSP response status code, when supplied. */
        statusCode?: number;
      }
    ).statusCode;
    if (
      status === CAMERA_RUNTIME_CONSTANTS.rtspUnauthorizedStatus ||
      status === CAMERA_RUNTIME_CONSTANTS.rtspForbiddenStatus
    )
      code = 'rtsp_authentication_failed';
    else if (status === CAMERA_RUNTIME_CONSTANTS.rtspUnsupportedTransportStatus)
      code = 'rtsp_unsupported_transport';
    else if (status === CAMERA_RUNTIME_CONSTANTS.rtspNotFoundStatus) code = 'EINVAL';
    cause = cause.cause;
  }
  return {
    message: e.message.slice(0, CAMERA_RUNTIME_CONSTANTS.maximumSerializedErrorChars),
    ...(code === undefined ? {} : { code }),
  };
}
