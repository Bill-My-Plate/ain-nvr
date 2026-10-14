/**
 * Reports malformed or unsupported RTP packet headers.
 */
export class RtpPacketError extends Error {
  override readonly name = 'RtpPacketError';
}
