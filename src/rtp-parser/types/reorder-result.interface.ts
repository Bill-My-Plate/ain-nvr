import type { ReorderedPacket } from './reordered-packet.interface.js';

export interface ReorderResult<T> {
  readonly packets: readonly ReorderedPacket<T>[];
  readonly duplicate: boolean;
  readonly reordered: boolean;
  readonly lost: number;
}
