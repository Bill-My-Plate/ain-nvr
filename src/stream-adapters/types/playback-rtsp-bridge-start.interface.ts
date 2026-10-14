/**
 * URL and timing information returned when the playback RTSP bridge starts.
 */
export interface PlaybackRtspBridgeStart {
  /** RTSP URL used to reach the stream or playback server. */
  readonly url: string;
  /** Requested start time in milliseconds. */
  readonly requestedStartTimeMs: number;
  /** Actual start time in milliseconds. */
  readonly actualStartTimeMs: number;
}
