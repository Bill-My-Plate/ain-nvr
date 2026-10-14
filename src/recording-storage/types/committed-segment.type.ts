/**
 * Published recording file paths and metadata returned after a commit.
 */
export type CommittedSegment = {
  /**
   * Stable identifier of the camera associated with this value.
   */
  cameraId: string;
  /** Unix millisecond time at which the session began. */
  sessionStartMs: number;
  /** Hour start in milliseconds. */
  hourStartMs: number;
  /** Segment start in milliseconds. */
  segmentStartMs: number;
  /** Published path of the segment’s media bytes. */
  mediaPath: string;
  /** Published path of this segment’s metadata file. */
  metadataPath: string;
  /** Published path of the recording session metadata file. */
  sessionMetadataPath: string;
};
