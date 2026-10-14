/**
 * RTP sequence number paired with its value while waiting for reordering.
 */
export type BufferedPacket<T> = {
  /** Unsigned RTP sequence number, wrapping after 65535. */
  readonly sequenceNumber: number;
  /** Application packet retained until its RTP sequence can be emitted. */
  readonly value: T;
};
