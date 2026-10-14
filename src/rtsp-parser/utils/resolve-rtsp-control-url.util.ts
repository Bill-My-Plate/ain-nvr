import { asDirectoryUrl } from './as-directory-url.util.js';
/**
 * Resolves an SDP control URI against the RTSP session or content base.
 */
export function resolveRtspControlUrl(
  describeUrl: string,
  mediaControl: string,
  sessionControl?: string,
  contentBase?: string,
): string {
  const base = contentBase ?? describeUrl;
  const sessionBase =
    !sessionControl || sessionControl === '*'
      ? base
      : new URL(sessionControl, asDirectoryUrl(base)).toString();

  if (mediaControl === '*') {
    return sessionBase;
  }
  return new URL(mediaControl, asDirectoryUrl(sessionBase)).toString();
}
