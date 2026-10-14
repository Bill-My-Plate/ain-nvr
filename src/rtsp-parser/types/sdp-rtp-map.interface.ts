/**
 * RTP payload number mapped to codec name, clock rate, and channels.
 */
export interface SdpRtpMap {
  /** RTP payload type negotiated for this track. */
  readonly payloadType: number;
  /** Codec encoding name advertised by SDP rtpmap. */
  readonly encodingName: string;
  /** RTP timestamp ticks per second for this track. */
  readonly clockRate: number;
  /** Number of audio channels declared for this RTP payload. */
  readonly channels?: number;
}
