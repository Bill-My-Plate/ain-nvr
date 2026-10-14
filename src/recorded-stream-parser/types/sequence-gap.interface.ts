/**
 * Lost RTP sequence span identified while reading stored packets.
 */
export interface SequenceGap {
  /** First RTP sequence number missing before the received packet. */
  readonly expected: number;
  /** First RTP sequence number actually present after the reported gap. */
  readonly actual: number;
  /** Number of RTP packets missing in this sequence gap. */
  readonly lost: number;
}
