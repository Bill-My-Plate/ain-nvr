




import type { FuAssembly } from './access-unit-assembler-fu-assembly.type.js';

/** Mutable state for packets grouped under one RTP timestamp. */
export type PendingAccessUnit = {
  /** Original 32-bit RTP timestamp of this unit. */
  readonly rtpTimestamp: number;
  /** RTP timestamp unwrapped across 32-bit rollover. */
  readonly unwrappedTimestamp: bigint;
  /** Wall-clock time from the first packet in this unit, in Unix ms. */
  readonly wallClockTimeMs: number;
  /** Complete NAL units collected so far. */
  readonly nalUnits: Buffer[];
  /** A malformed or missing packet makes this unit unsafe to emit. */
  damaged: boolean;
  /** Sum of RTP payload lengths, used for the 8 MiB limit. */
  bytes: number;
  /** Number of RTP packets seen for this unit, used for the 4,096 limit. */
  packets: number;
  /** Stops parsing further packets with this timestamp after a limit. */
  overflowed: boolean;
  /** Fragmented NAL unit still being reconstructed, if any. */
  fu?: FuAssembly | undefined;
};
