





import { getRtspHeader, type RtspMessage } from '../../rtsp-parser/index.js';



export function publicMethods(response: RtspMessage): Set<string> {
  const value = getRtspHeader(response, 'public') ?? '';
  return new Set(value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean));
}
