/** Fields used to scan RTP Control Protocol (RTCP) packets. */
export const RTCP_PACKET_LAYOUT = {
  version: 2,
  versionShift: 6,
  headerBytes: 4,
  firstByteOffset: 0,
  packetTypeOffset: 1,
  lengthFieldOffset: 2,
  /** The wire length stores the number of 32-bit words minus one. */
  lengthFieldBiasWords: 1,
  wordBytes: 4,
  senderReportType: 200,
  senderReport: {
    fixedBytes: 28,
    receptionReportBlockBytes: 24,
    reportCountMask: 0x1f,
    ssrcOffset: 4,
    ntpSecondsOffset: 8,
    ntpFractionOffset: 12,
    rtpTimestampOffset: 16,
    senderPacketCountOffset: 20,
    senderOctetCountOffset: 24,
    millisecondsPerSecond: 1_000,
    /** NTP's fractional seconds field has 32 bits. */
    ntpFractionUnitsPerSecond: 0x1_0000_0000,
  },
} as const;
