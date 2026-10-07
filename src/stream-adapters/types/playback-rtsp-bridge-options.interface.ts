import type { Logger } from '../../shared/index.js';
import type { PlaybackMessage } from '../../playback/index.js';



export interface PlaybackRtspBridgeOptions {
  readonly playback: AsyncGenerator<PlaybackMessage>;
  readonly endTimeMs?: number;
  readonly audioSampleRate?: number;
  readonly signal?: AbortSignal;
  readonly logger?: Logger;
  readonly maximumQueuedBytes?: number;
  readonly playTimeoutMs?: number;
}
