import { serializeError } from './serialize-error.util.js';
/**
 * Classifies camera failures that require stopping worker recovery.
 */
export function terminalCameraError(error: unknown): boolean {
  return [
    'rtsp_authentication_failed',
    'unsupported_codec',
    'rtsp_unsupported_transport',
    'EINVAL',
  ].includes(serializeError(error).code ?? '');
}
