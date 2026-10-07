








import type { OrderedInput } from './ordered-input.type.js';

export type PendingSafeAccessUnit = {
  readonly timestamp: number;
  readonly packets: OrderedInput[];
  bytes: number;
  damaged: boolean;
  hasIdr: boolean;
  fuNalType: number | undefined;
};
