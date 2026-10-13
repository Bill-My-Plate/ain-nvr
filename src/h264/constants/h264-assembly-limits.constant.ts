/** Limits used while buffering H.264 packets, fragments, and timestamps. */
export const H264_ASSEMBLY_LIMITS = {
  maximumRtpPayloadType: 127,
  maximumAccessUnitPayloadBytes: 8 * 1024 * 1024,
  maximumAccessUnitPackets: 4_096,
  maximumFuNalBytes: 8 * 1024 * 1024,
  maximumFuChunks: 4_096,
  microsecondsPerMillisecond: 1_000,
} as const;
