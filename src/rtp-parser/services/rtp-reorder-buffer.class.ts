import type { ReorderedPacket } from '../types/reordered-packet.interface.js';
import type { ReorderResult } from '../types/reorder-result.interface.js';
import type { BufferedPacket } from '../types/buffered-packet.type.js';
import { RTP_SEQUENCE_SPACE } from '../constants/rtp-sequence-space.constant.js';
import { RTP_REORDER_WINDOW } from '../constants/rtp-reorder-window.constant.js';
import { forwardDistance } from '../utils/forward-distance.util.js';
/** Reorder one RTP sequence stream with bounded waiting and 16-bit rollover. */
export class RtpReorderBuffer<T> {
  private expected: number | undefined;
  private readonly buffered = new Map<number, BufferedPacket<T>>();
  /** The window is the maximum number of packets to wait for a missing sequence. */
  public constructor(private readonly windowPackets: number = RTP_REORDER_WINDOW.defaultPackets) {
    const { minimumPackets, maximumPackets } = RTP_REORDER_WINDOW;
    if (
      !Number.isInteger(windowPackets) ||
      windowPackets < minimumPackets ||
      windowPackets > maximumPackets
    ) {
      throw new RangeError(
        `RTP reorder window must be between ${minimumPackets} and ${maximumPackets} packets.`,
      );
    }
  }

  /** Add a packet and return packets that can now be emitted in sequence. */
  public push(sequenceNumber: number, value: T): ReorderResult<T> {
    if (
      !Number.isInteger(sequenceNumber) ||
      sequenceNumber < RTP_SEQUENCE_SPACE.minimum ||
      sequenceNumber > RTP_SEQUENCE_SPACE.maximum
    ) {
      throw new RangeError('RTP sequence number must be an unsigned 16-bit integer.');
    }
    this.expected ??= sequenceNumber;
    const distance = forwardDistance(this.expected, sequenceNumber);
    // A distance of half the sequence space or more is treated as late.
    if (distance >= RTP_SEQUENCE_SPACE.halfRange || this.buffered.has(sequenceNumber)) {
      return { packets: [], duplicate: true, reordered: false, lost: 0 };
    }
    this.buffered.set(sequenceNumber, { sequenceNumber, value });
    const reordered = distance > 0;
    return this.drain(false, reordered);
  }

  /** Emit buffered packets and count any gaps without waiting for more input. */
  public flush(): ReorderResult<T> {
    return this.drain(true, false);
  }

  /** Forget all ordering state before processing a new stream or discontinuity. */
  public reset(): void {
    this.expected = undefined;
    this.buffered.clear();
  }

  /** Emit consecutive packets; advance past a gap when the window fills or on flush. */
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
        this.expected =
          (this.expected + RTP_SEQUENCE_SPACE.nextPacketStep) & RTP_SEQUENCE_SPACE.mask;
        continue;
      }
      // The sequence-space size is larger than any valid forward distance.
      let nearest: number = RTP_SEQUENCE_SPACE.size;
      let farthest = 0;
      for (const sequenceNumber of this.buffered.keys()) {
        const distance = forwardDistance(this.expected, sequenceNumber);
        if (distance < RTP_SEQUENCE_SPACE.halfRange) {
          nearest = Math.min(nearest, distance);
          farthest = Math.max(farthest, distance);
        }
      }
      if (nearest === RTP_SEQUENCE_SPACE.size) break;
      // Keep waiting while the gap fits in the configured window and it is not full.
      if (!flush && farthest < this.windowPackets && this.buffered.size < this.windowPackets) break;
      // A flush skips the whole gap; otherwise advance one missing sequence at a time.
      const skipped = flush ? nearest : RTP_SEQUENCE_SPACE.nextPacketStep;
      this.expected = (this.expected + skipped) & RTP_SEQUENCE_SPACE.mask;
      lost += skipped;
      lostBefore += skipped;
    }
    return { packets, duplicate: false, reordered, lost };
  }
}
