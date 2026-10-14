/**
 * RTP or RTCP frame retained before a loopback client starts playback.
 */
export type BufferedFrame = {
  /** Whether this buffered frame belongs to the RTCP channel. */
  readonly isRtcp: boolean;
  /** Media bytes after the RTP or protocol header. */
  readonly payload: Buffer;
};
