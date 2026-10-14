/**
 * Stored clock reference used to reconstruct packet time during playback.
 */
export type ClockAnchorMetadata = {
  /**
   * Identifier of the negotiated media track.
   */
  trackId: string;
  /** Producer of packets, bytes, or segments consumed by this operation. */
  source: 'arrival' | 'rtcp-sr';
  /** Time in Unix milliseconds. */
  timeMs: number;
  /** RTP timestamp in the track clock rate; it is not Unix time. */
  rtpTimestamp: number;
  /** Byte offset from the start of the stored media file. */
  byteOffset: number;
};
