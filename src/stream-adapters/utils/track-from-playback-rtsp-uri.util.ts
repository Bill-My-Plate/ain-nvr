/** Reads the video or audio track number from a local RTSP SETUP URL. */
export function trackFromPlaybackRtspUri(uri: string): 0 | 1 | undefined {
  try {
    const pathname = new URL(uri).pathname;
    if (pathname.endsWith('/trackID=0')) return 0;
    if (pathname.endsWith('/trackID=1')) return 1;
  } catch {
    return undefined;
  }
  return undefined;
}
