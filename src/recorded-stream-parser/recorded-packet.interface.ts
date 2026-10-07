import type { TrackDescription } from '../media/index.js';
import { type RtpPacket } from '../rtp-parser/index.js';

import type { RtspInterleavedFrame } from '../rtsp-parser/index.js';


import type { RecordedSegmentDescriptor } from './recorded-segment-descriptor.interface.js';
import type { SequenceGap } from './sequence-gap.interface.js';

export interface RecordedPacket<TSegmentRef = unknown> {
  readonly segment: RecordedSegmentDescriptor<TSegmentRef>;
  readonly byteOffset: number;
  readonly frame: RtspInterleavedFrame;
  readonly rtp?: RtpPacket;
  readonly track?: TrackDescription;
  readonly wallClockTimeMs: number;
  readonly sequenceGap?: SequenceGap;
  readonly discontinuity: boolean;
}
