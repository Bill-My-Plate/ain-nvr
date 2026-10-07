




import type { FuAssembly } from './access-unit-assembler-fu-assembly.type.js';

export type PendingAccessUnit = {
  readonly rtpTimestamp: number;
  readonly unwrappedTimestamp: bigint;
  readonly wallClockTimeMs: number;
  readonly nalUnits: Buffer[];
  damaged: boolean;
  bytes: number;
  packets: number;
  overflowed: boolean;
  fu?: FuAssembly | undefined;
};
