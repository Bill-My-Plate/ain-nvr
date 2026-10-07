import type { RtcpSenderReport } from './rtcp-sender-report.interface.js';
import { RtcpPacketError } from './rtcp-packet-error.class.js';
import { parseRtcpSenderReport } from './parse-rtcp-sender-report.util.js';

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
