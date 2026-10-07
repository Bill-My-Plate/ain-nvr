





export interface ClockAnchor {
  readonly trackId: string;
  readonly byteOffset: number;
  readonly timeMs: number;
  readonly rtpTimestamp: number;
}
