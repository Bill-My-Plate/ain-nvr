export interface ReorderedPacket<T> {
  readonly value: T;
  readonly lostBefore: number;
}
