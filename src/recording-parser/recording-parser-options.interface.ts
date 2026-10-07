
import type { TrackDescription } from '../media/index.js';







export interface RecordingParserOptions {
  readonly tracks: readonly TrackDescription[];
  readonly reorderWindowPackets?: number;
  readonly playpointIntervalMs?: number;
  /**
   * Wait for a complete, undamaged H.264 IDR access unit before the first
   * write and every requested boundary. The default preserves the original
   * next-packet boundary behavior.
   */
  readonly decoderSafeBoundaries?: boolean;
}
