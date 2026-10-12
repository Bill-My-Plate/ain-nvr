/**
 * Optional RTP header extension, present when the fixed header's X bit is set.
 * On the wire: a 16-bit profile, a 16-bit data length in 32-bit words, then data.
 */
export type RtpHeaderExtension = {
  /** Identifies how to interpret the extension data; this parser leaves it uninterpreted. */
  readonly profile: number;
  /** Extension bytes without the four-byte extension header; a view into the raw RTP packet. */
  readonly data: Buffer;
};
