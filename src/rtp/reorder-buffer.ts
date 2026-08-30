export interface ReorderedPacket<T> {
  readonly value: T;
  readonly lostBefore: number;
}

export interface ReorderResult<T> {
  readonly packets: readonly ReorderedPacket<T>[];
  readonly duplicate: boolean;
  readonly reordered: boolean;
  readonly lost: number;
}

interface BufferedPacket<T> {
  readonly sequenceNumber: number;
  readonly value: T;
}

function forwardDistance(from: number, to: number): number {
  return (to - from) & 0xffff;
}

/** Small, bounded RTP reorder buffer with correct 16-bit sequence rollover. */
export class RtpReorderBuffer<T> {
  private expected: number | undefined;
  private readonly buffered = new Map<number, BufferedPacket<T>>();

  constructor(private readonly windowPackets = 4) {
    if (!Number.isInteger(windowPackets) || windowPackets < 1 || windowPackets > 0x7fff) {
      throw new RangeError('RTP reorder window must be between 1 and 32767 packets.');
    }
  }

  push(sequenceNumber: number, value: T): ReorderResult<T> {
    if (!Number.isInteger(sequenceNumber) || sequenceNumber < 0 || sequenceNumber > 0xffff) {
      throw new RangeError('RTP sequence number must be an unsigned 16-bit integer.');
    }
    this.expected ??= sequenceNumber;
    const distance = forwardDistance(this.expected, sequenceNumber);
    if (distance >= 0x8000 || this.buffered.has(sequenceNumber)) {
      return { packets: [], duplicate: true, reordered: false, lost: 0 };
    }
    this.buffered.set(sequenceNumber, { sequenceNumber, value });
    const reordered = distance > 0;
    return this.drain(false, reordered);
  }

  flush(): ReorderResult<T> {
    return this.drain(true, false);
  }

  reset(): void {
    this.expected = undefined;
    this.buffered.clear();
  }

  private drain(flush: boolean, reordered: boolean): ReorderResult<T> {
    const packets: ReorderedPacket<T>[] = [];
    let lost = 0;
    let lostBefore = 0;
    while (this.expected !== undefined && this.buffered.size > 0) {
      const packet = this.buffered.get(this.expected);
      if (packet !== undefined) {
        this.buffered.delete(this.expected);
        packets.push({ value: packet.value, lostBefore });
        lostBefore = 0;
        this.expected = (this.expected + 1) & 0xffff;
        continue;
      }
      let nearest = 0x1_0000;
      let farthest = 0;
      for (const sequenceNumber of this.buffered.keys()) {
        const distance = forwardDistance(this.expected, sequenceNumber);
        if (distance < 0x8000) {
          nearest = Math.min(nearest, distance);
          farthest = Math.max(farthest, distance);
        }
      }
      if (nearest === 0x1_0000) break;
      if (!flush && farthest < this.windowPackets && this.buffered.size < this.windowPackets) break;
      const skipped = flush ? nearest : 1;
      this.expected = (this.expected + skipped) & 0xffff;
      lost += skipped;
      lostBefore += skipped;
    }
    return { packets, duplicate: false, reordered, lost };
  }
}
