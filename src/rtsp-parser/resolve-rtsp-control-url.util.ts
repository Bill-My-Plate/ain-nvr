import { asDirectoryUrl } from './as-directory-url.util.js';

export function resolveRtspControlUrl(
  describeUrl: string,
  mediaControl: string,
  sessionControl?: string,
  contentBase?: string,
): string {
  const base = contentBase ?? describeUrl;
  const sessionBase = !sessionControl || sessionControl === '*'
    ? base
    : new URL(sessionControl, asDirectoryUrl(base)).toString();

  if (mediaControl === '*') {
    return sessionBase;
  }
  return new URL(mediaControl, asDirectoryUrl(sessionBase)).toString();
}
