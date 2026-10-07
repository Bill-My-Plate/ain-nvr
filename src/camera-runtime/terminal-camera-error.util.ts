


import { serializeError } from './serialize-error.util.js';

export function terminalCameraError(error: unknown): boolean {
  return ['rtsp_authentication_failed', 'unsupported_codec', 'rtsp_unsupported_transport', 'EINVAL']
    .includes(serializeError(error).code ?? '');
}
