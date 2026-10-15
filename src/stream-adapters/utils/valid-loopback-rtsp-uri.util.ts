/** Accepts OPTIONS * or a URL within this server's local token scope. */
export function validLoopbackRtspUri(uri: string, method: string, token: string): boolean {
  if (method === 'OPTIONS' && uri === '*') return true;
  try {
    const parsed = new URL(uri);
    return (
      parsed.hostname === '127.0.0.1' &&
      (parsed.pathname === `/${token}` ||
        parsed.pathname === `/${token}/` ||
        parsed.pathname === `/${token}/trackID=0`)
    );
  } catch {
    return false;
  }
}
