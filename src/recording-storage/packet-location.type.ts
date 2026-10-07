


import type { ActiveRecordingSegment } from './active-recording-segment.type.js';

export type PacketLocation = {
  segment: ActiveRecordingSegment;
  byteOffset: number;
};
