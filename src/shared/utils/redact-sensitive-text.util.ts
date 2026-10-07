import { RTSP_URL_PATTERN } from '../constants/rtsp-url-pattern.constant.js';
import { AUTHORIZATION_PATTERN } from '../constants/authorization-pattern.constant.js';

export function redactSensitiveText(value: string): string {
  return value
    .replace(RTSP_URL_PATTERN, (match) => {
      const scheme = match.toLowerCase().startsWith('rtsps:') ? 'rtsps' : 'rtsp';
      return `${scheme}://[redacted]`;
    })
    .replace(AUTHORIZATION_PATTERN, '$1[redacted]');
}
