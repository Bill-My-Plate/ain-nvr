/**
 * Treats an RTSP URL path as a directory before resolving a relative control URI.
 */
export function asDirectoryUrl(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
