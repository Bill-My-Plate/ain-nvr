import type { ActiveRecordingSegment } from './active-recording-segment.type.js';
/**
 * Byte position of a written packet within a recording segment.
 */
export type PacketLocation = {
  /** Recording segment being written or played. */
  segment: ActiveRecordingSegment;
  /** Byte offset from the start of the stored media file. */
  byteOffset: number;
};
