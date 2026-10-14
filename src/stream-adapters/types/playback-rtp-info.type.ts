/**
 * RTP payload type, clock, and sequence state for serving playback.
 */
export type PlaybackRtpInfo = {
  /** First RTP sequence number sent for this playback track. */
  readonly initialSequenceNumber: number;
  /** RTP timestamp corresponding to playback track start. */
  readonly initialTimestamp: number;
};
