import { NTP_UNIX_EPOCH_SECONDS } from './ntp-unix-epoch-seconds.constant.js';
import type { RtcpSenderReport } from './rtcp-sender-report.interface.js';
import { RtcpPacketError } from './rtcp-packet-error.class.js';

export function parseRtcpSenderReport(packet: Buffer): RtcpSenderReport {
  if (packet.length < 28) {
    throw new RtcpPacketError('RTCP Sender Report is truncated.');
  }
  const first = packet[0] ?? 0;
  if (first >>> 6 !== 2) {
    throw new RtcpPacketError('Unsupported RTCP version.');
  }
  if (packet[1] !== 200) {
    throw new RtcpPacketError('RTCP packet is not a Sender Report.');
  }

  const reportCount = first & 0x1f;
  const packetLength = (packet.readUInt16BE(2) + 1) * 4;
  const minimumLength = 28 + reportCount * 24;
  if (packetLength < minimumLength || packetLength > packet.length) {
    throw new RtcpPacketError('RTCP Sender Report length is invalid.');
  }

  const ntpSeconds = packet.readUInt32BE(8);
  const ntpFraction = packet.readUInt32BE(12);
  const ntpTimeMs = (ntpSeconds - NTP_UNIX_EPOCH_SECONDS) * 1000
    + ntpFraction * 1000 / 0x1_0000_0000;

  return {
    ssrc: packet.readUInt32BE(4),
    ntpSeconds,
    ntpFraction,
    ntpTimeMs,
    rtpTimestamp: packet.readUInt32BE(16),
    senderPacketCount: packet.readUInt32BE(20),
    senderOctetCount: packet.readUInt32BE(24),
    reportCount,
    packetLength,
  };
}
