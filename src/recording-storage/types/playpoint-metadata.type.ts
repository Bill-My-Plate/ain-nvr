/**
 * Stored seek point at a scheduled interval of recording time.
 */
export type PlaypointMetadata = {
  /** Time in Unix milliseconds. */
  timeMs: number;
  /** Offset in milliseconds. */
  offsetMs: number;
  /** Byte offset from the start of the stored media file. */
  byteOffset: number;
};
