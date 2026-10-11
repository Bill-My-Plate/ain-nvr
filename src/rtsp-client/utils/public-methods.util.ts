





import { type RtspMessage } from '../../rtsp-parser/index.js';



export function publicMethods(response: RtspMessage): Set<string> {
  const value = response.headers.get('public') ?? '';
  return new Set(value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean));
}
