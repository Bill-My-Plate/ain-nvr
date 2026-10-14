/** Named protocol fields, time units, and operational limits for recorded-stream-parser. */
export const RECORDED_STREAM_CONSTANTS = {
  maximumInterleavedPayloadBytes: 65_535,
  maximumRtpSequenceNumber: 0xffff,
  rtpTimestampHalfRange: 0x8000_0000,
  rtpTimestampRange: 0x1_0000_0000,
  millisecondsPerSecond: 1_000,
  maximumTimestampDiscontinuityMs: 5_000,
  defaultReorderWindowPackets: 4,
  interleavedHeaderBytes: 4,
  interleavedMarker: 0x24,
  interleavedLengthOffset: 2,
} as const;
