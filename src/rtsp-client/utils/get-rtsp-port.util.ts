import { RTSP_CLIENT_DEFAULTS } from '../constants/rtsp-client-defaults.constant.js';
/** Return the explicit URL port, or the default port for RTSP or RTSPS. */
export function getRtspPort(url: URL): number {
  if (url.port !== '') {
    return Number(url.port);
  }
  return url.protocol === 'rtsps:' ? RTSP_CLIENT_DEFAULTS.rtspsPort : RTSP_CLIENT_DEFAULTS.rtspPort;
}
