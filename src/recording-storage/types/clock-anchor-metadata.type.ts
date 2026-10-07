


export type ClockAnchorMetadata = {
  trackId: string;
  source: 'arrival' | 'rtcp-sr';
  timeMs: number;
  rtpTimestamp: number;
  byteOffset: number;
};
