


export type RtpPacketizerOptions = {
  readonly payloadType: number;
  readonly clockRate: number;
  readonly maximumPayloadBytes?: number;
  readonly initialSequenceNumber?: number;
  readonly initialTimestamp?: number;
  readonly ssrc?: number;
};
