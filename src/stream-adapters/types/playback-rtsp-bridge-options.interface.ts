import type { PlaybackMessage } from '../../playback/index.js';

export interface PlaybackRtspBridgeOptions {
  readonly playback: AsyncGenerator<PlaybackMessage>;
  readonly endTimeMs?: number;
  readonly audioSampleRate?: number;
  readonly signal?: AbortSignal;
  readonly maximumQueuedBytes?: number;
  readonly playTimeoutMs?: number;
}
