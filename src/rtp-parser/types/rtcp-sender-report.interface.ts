export interface RtcpSenderReport {
  readonly ssrc: number;
  readonly ntpSeconds: number;
  readonly ntpFraction: number;
  readonly ntpTimeMs: number;
  readonly rtpTimestamp: number;
  readonly senderPacketCount: number;
  readonly senderOctetCount: number;
  readonly reportCount: number;
  readonly packetLength: number;
}
