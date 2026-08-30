const NTP_UNIX_EPOCH_SECONDS = 2_208_988_800;

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

export class RtcpPacketError extends Error {
  override readonly name = 'RtcpPacketError';
}

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

export function findRtcpSenderReport(compoundPacket: Buffer): RtcpSenderReport | undefined {
  let offset = 0;
  while (offset < compoundPacket.length) {
    if (compoundPacket.length - offset < 4) {
      throw new RtcpPacketError('RTCP compound packet has a partial header.');
    }
    const first = compoundPacket[offset] ?? 0;
    if (first >>> 6 !== 2) {
      throw new RtcpPacketError('Unsupported RTCP version.');
    }
    const packetLength = (compoundPacket.readUInt16BE(offset + 2) + 1) * 4;
    if (packetLength < 4 || offset + packetLength > compoundPacket.length) {
      throw new RtcpPacketError('RTCP compound packet length is invalid.');
    }
    if (compoundPacket[offset + 1] === 200) {
      return parseRtcpSenderReport(compoundPacket.subarray(offset, offset + packetLength));
    }
    offset += packetLength;
  }
  return undefined;
}
