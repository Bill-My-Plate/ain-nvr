



import type { RtspMessage } from './rtsp-message.interface.js';

export function getRtspHeader(
  message: RtspMessage,
  name: string,
): string | undefined {
  return message.headers.get(name.toLowerCase());
}
