import type { RtcpSenderReport } from "../types/rtcp-sender-report.interface.js";
import { RtcpPacketError } from "../errors/rtcp-packet-error.class.js";
import { RTCP_PACKET_LAYOUT } from "../constants/rtcp-packet-layout.constant.js";
import { parseRtcpSenderReport } from "./parse-rtcp-sender-report.util.js";

export function findRtcpSenderReport(
  compoundPacket: Buffer,
): RtcpSenderReport | undefined {
  let offset = 0;
  while (offset < compoundPacket.length) {
    if (compoundPacket.length - offset < RTCP_PACKET_LAYOUT.headerBytes) {
      throw new RtcpPacketError("RTCP compound packet has a partial header.");
    }
    const first = compoundPacket[offset] ?? 0;
    if (
      first >>> RTCP_PACKET_LAYOUT.versionShift !==
      RTCP_PACKET_LAYOUT.version
    ) {
      throw new RtcpPacketError("Unsupported RTCP version.");
    }
    const lengthField = compoundPacket.readUInt16BE(
      offset + RTCP_PACKET_LAYOUT.lengthFieldOffset,
    );
    const packetLength =
      (lengthField + RTCP_PACKET_LAYOUT.lengthFieldBiasWords) *
      RTCP_PACKET_LAYOUT.wordBytes;
    if (
      packetLength < RTCP_PACKET_LAYOUT.headerBytes ||
      offset + packetLength > compoundPacket.length
    ) {
      throw new RtcpPacketError("RTCP compound packet length is invalid.");
    }
    if (
      compoundPacket[offset + RTCP_PACKET_LAYOUT.packetTypeOffset] ===
      RTCP_PACKET_LAYOUT.senderReportType
    ) {
      return parseRtcpSenderReport(
        compoundPacket.subarray(offset, offset + packetLength),
      );
    }
    offset += packetLength;
  }
  return undefined;
}
