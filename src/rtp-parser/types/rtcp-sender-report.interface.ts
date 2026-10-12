/** Timing and transmission counts extracted from one RTCP Sender Report. */
export interface RtcpSenderReport {
  /** Synchronization source identifier of the sender that issued this report. */
  readonly ssrc: number;
  /** Whole seconds since the NTP epoch (1 January 1900). */
  readonly ntpSeconds: number;
  /** Fraction of an NTP second, stored as an unsigned 32-bit value. */
  readonly ntpFraction: number;
  /** NTP time converted to milliseconds since the Unix epoch. */
  readonly ntpTimeMs: number;
  /** RTP media-clock timestamp corresponding to the NTP time above. */
  readonly rtpTimestamp: number;
  /** Total RTP packets sent by this source since it began sending. */
  readonly senderPacketCount: number;
  /** Total RTP payload bytes sent, excluding RTP headers and padding. */
  readonly senderOctetCount: number;
  /** Number of reception report blocks following the sender information. */
  readonly reportCount: number;
  /** Declared length of this RTCP packet in bytes, including its header. */
  readonly packetLength: number;
}
