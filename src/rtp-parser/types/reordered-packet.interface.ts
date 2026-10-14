/**
 * Value emitted in RTP order with the preceding loss count.
 */
export interface ReorderedPacket<T> {
  /** Application packet released in RTP sequence order. */
  readonly value: T;
  /** Number of RTP packets declared lost immediately before this packet. */
  readonly lostBefore: number;
}
