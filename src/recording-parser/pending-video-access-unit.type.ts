








export type PendingVideoAccessUnit<TLocation> = {
  readonly timestamp: number;
  readonly location: TLocation;
  readonly timeMs: number;
  readonly sequenceNumber: number;
  damaged: boolean;
  hasIdr: boolean;
  fuNalType: number | undefined;
};
