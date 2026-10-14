import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
/**
 * Prefixes a complete RTP or RTCP packet with the four-byte RTSP interleaved header.
 * @param packet One complete RTP or RTCP packet; the four-byte RTSP interleaved prefix is added here (marker, channel, two-byte big-endian length).
 */
export function interleavedFrame(channel: number, packet: Buffer): Buffer {
  const header = Buffer.allocUnsafe(STREAM_ADAPTER_CONSTANTS.interleavedHeaderBytes);
  header[0] = STREAM_ADAPTER_CONSTANTS.interleavedMarker;
  header[1] = channel;
  header.writeUInt16BE(packet.length, STREAM_ADAPTER_CONSTANTS.interleavedLengthOffset);
  return Buffer.concat([header, packet]);
}
