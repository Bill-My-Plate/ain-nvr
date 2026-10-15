/** Allows only this server's token-scoped local RTSP URL and OPTIONS *. */
export function validPlaybackRtspUri(uri: string, method: string, token: string): boolean {
  if (method === 'OPTIONS' && uri === '*') return true;
  try {
    const parsed = new URL(uri);
    return (
      parsed.protocol === 'rtsp:' &&
      parsed.hostname === '127.0.0.1' &&
      (parsed.pathname === `/${token}` ||
        parsed.pathname === `/${token}/` ||
        parsed.pathname === `/${token}/trackID=0` ||
        parsed.pathname === `/${token}/trackID=1`)
    );
  } catch {
    return false;
  }
}
