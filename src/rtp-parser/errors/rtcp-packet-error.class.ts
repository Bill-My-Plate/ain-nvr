/**
 * Reports malformed or truncated RTCP packets.
 */
export class RtcpPacketError extends Error {
  override readonly name = 'RtcpPacketError';
}
