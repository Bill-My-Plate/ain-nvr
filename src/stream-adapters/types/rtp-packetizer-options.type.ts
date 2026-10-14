/**
 * Configuration options for rtp Packetizer.
 */
export type RtpPacketizerOptions = {
  /** RTP payload type negotiated for this track. */
  readonly payloadType: number;
  /** RTP timestamp ticks per second for this track. */
  readonly clockRate: number;
  /** Maximum payload measured in bytes. */
  readonly maximumPayloadBytes?: number;
  /** Starting RTP sequence number for this packetizer. */
  readonly initialSequenceNumber?: number;
  /** Starting RTP timestamp for this packetizer. */
  readonly initialTimestamp?: number;
  /** 32-bit synchronization source identifier in an RTP stream. */
  readonly ssrc?: number;
};
