/**
 * Video access unit held while the recording boundary is decided.
 */
export type PendingVideoAccessUnit<TLocation> = {
  /** RTP timestamp shared by the fragments of this pending access unit. */
  readonly timestamp: number;
  /** Location of the packet in a stored segment. */
  readonly location: TLocation;
  /** Time in Unix milliseconds. */
  readonly timeMs: number;
  /** Unsigned RTP sequence number, wrapping after 65535. */
  readonly sequenceNumber: number;
  /** Whether packet loss or malformed fragments made this access unit incomplete. */
  damaged: boolean;
  /** Whether this access unit contains an IDR keyframe. */
  hasIdr: boolean;
  /** NAL type reconstructed from the FU-A fragment header. */
  fuNalType: number | undefined;
};
