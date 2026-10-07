export type BufferedPacket<T> = {
  readonly sequenceNumber: number;
  readonly value: T;
};
