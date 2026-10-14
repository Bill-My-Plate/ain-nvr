/**
 * RTP timestamp paired with an observed wall-clock time.
 */
export interface ClockAnchor {
  /**
   * Identifier of the negotiated media track.
   */
  readonly trackId: string;
  /** Byte offset from the start of the stored media file. */
  readonly byteOffset: number;
  /** Time in Unix milliseconds. */
  readonly timeMs: number;
  /** RTP timestamp in the track clock rate; it is not Unix time. */
  readonly rtpTimestamp: number;
}
