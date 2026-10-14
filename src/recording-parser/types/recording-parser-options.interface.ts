import type { TrackDescription } from '../../media/index.js';
/**
 * Configuration options for recording Parser.
 */
export interface RecordingParserOptions {
  /** Track descriptions participating in this session. */
  readonly tracks: readonly TrackDescription[];
  /** Maximum number of RTP packets held while waiting for sequence gaps. */
  readonly reorderWindowPackets?: number;
  /** Playpoint interval in milliseconds. */
  readonly playpointIntervalMs?: number;
  /**
   * Wait for a complete, undamaged H.264 IDR access unit before the first
   * write and every requested boundary. The default preserves the original
   * next-packet boundary behavior.
   */
  readonly decoderSafeBoundaries?: boolean;
}
