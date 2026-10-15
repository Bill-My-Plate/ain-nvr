/** Raises the caller's abort reason, preserving the bridge's fallback error. */
export function throwIfPlaybackAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('Playback RTSP bridge aborted.');
  }
}
