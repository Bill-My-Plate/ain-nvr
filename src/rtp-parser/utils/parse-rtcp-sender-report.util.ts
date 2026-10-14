import { NTP_UNIX_EPOCH_SECONDS } from '../constants/ntp-unix-epoch-seconds.constant.js';
import { RTCP_PACKET_LAYOUT } from '../constants/rtcp-packet-layout.constant.js';
import type { RtcpSenderReport } from '../types/rtcp-sender-report.interface.js';
import { RtcpPacketError } from '../errors/rtcp-packet-error.class.js';
/**
 * Validates one complete RTCP sender report and reads its clock and count fields.
 * @param packet One complete RTCP sender report: four-byte common header, four-byte SSRC, eight-byte NTP time, four-byte RTP time, and two four-byte sender counts, followed by optional report blocks.
 */
export function parseRtcpSenderReport(packet: Buffer): RtcpSenderReport {
  const senderReport = RTCP_PACKET_LAYOUT.senderReport;
  if (packet.length < senderReport.fixedBytes) {
    throw new RtcpPacketError('RTCP Sender Report is truncated.');
  }
  const first = packet[RTCP_PACKET_LAYOUT.firstByteOffset] ?? 0;
  if (first >>> RTCP_PACKET_LAYOUT.versionShift !== RTCP_PACKET_LAYOUT.version) {
    throw new RtcpPacketError('Unsupported RTCP version.');
  }
  if (packet[RTCP_PACKET_LAYOUT.packetTypeOffset] !== RTCP_PACKET_LAYOUT.senderReportType) {
    throw new RtcpPacketError('RTCP packet is not a Sender Report.');
  }

  const reportCount = first & senderReport.reportCountMask;
  const lengthField = packet.readUInt16BE(RTCP_PACKET_LAYOUT.lengthFieldOffset);
  const packetLength =
    (lengthField + RTCP_PACKET_LAYOUT.lengthFieldBiasWords) * RTCP_PACKET_LAYOUT.wordBytes;
  const minimumLength =
    senderReport.fixedBytes + reportCount * senderReport.receptionReportBlockBytes;
  if (packetLength < minimumLength || packetLength > packet.length) {
    throw new RtcpPacketError('RTCP Sender Report length is invalid.');
  }

  const ntpSeconds = packet.readUInt32BE(senderReport.ntpSecondsOffset);
  const ntpFraction = packet.readUInt32BE(senderReport.ntpFractionOffset);
  const ntpTimeMs =
    (ntpSeconds - NTP_UNIX_EPOCH_SECONDS) * senderReport.millisecondsPerSecond +
    (ntpFraction * senderReport.millisecondsPerSecond) / senderReport.ntpFractionUnitsPerSecond;

  return {
    ssrc: packet.readUInt32BE(senderReport.ssrcOffset),
    ntpSeconds,
    ntpFraction,
    ntpTimeMs,
    rtpTimestamp: packet.readUInt32BE(senderReport.rtpTimestampOffset),
    senderPacketCount: packet.readUInt32BE(senderReport.senderPacketCountOffset),
    senderOctetCount: packet.readUInt32BE(senderReport.senderOctetCountOffset),
    reportCount,
    packetLength,
  };
}
