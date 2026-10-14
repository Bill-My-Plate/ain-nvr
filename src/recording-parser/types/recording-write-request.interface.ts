import type { MediaPacket } from '../../media/index.js';
/**
 * Packet write plus boundary and discontinuity instructions.
 */
export interface RecordingWriteRequest {
  /** Media packet to write to the active segment. */
  readonly packet: MediaPacket;
  /** Whether a new segment must begin before this packet. */
  readonly boundaryBefore: boolean;
  /** Whether this item follows a source or timing discontinuity. */
  readonly discontinuityBefore: boolean;
}
