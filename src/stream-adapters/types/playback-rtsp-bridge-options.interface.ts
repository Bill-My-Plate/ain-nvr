import type { PlaybackMessage } from '../../playback/index.js';
/**
 * Configuration options for playback Rtsp Bridge.
 */
export interface PlaybackRtspBridgeOptions {
  /** Asynchronous playback message source served by the RTSP bridge. */
  readonly playback: AsyncGenerator<PlaybackMessage>;
  /** End time in milliseconds. */
  readonly endTimeMs?: number;
  /** Samples per second for the optional audio track. */
  readonly audioSampleRate?: number;
  /** Abort signal used to cancel this operation. */
  readonly signal?: AbortSignal;
  /** Maximum queued measured in bytes. */
  readonly maximumQueuedBytes?: number;
  /** Play timeout in milliseconds. */
  readonly playTimeoutMs?: number;
}
