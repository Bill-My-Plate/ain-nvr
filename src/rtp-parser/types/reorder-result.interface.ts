import type { ReorderedPacket } from './reordered-packet.interface.js';
/**
 * Result of reorder.
 */
export interface ReorderResult<T> {
  /** Packets produced or retained by this operation. */
  readonly packets: readonly ReorderedPacket<T>[];
  /** Whether the input repeated a sequence number already seen. */
  readonly duplicate: boolean;
  /** Whether the input arrived ahead of the next expected sequence. */
  readonly reordered: boolean;
  /** Number of RTP packets missing in this sequence gap. */
  readonly lost: number;
}
