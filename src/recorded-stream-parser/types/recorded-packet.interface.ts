import type { TrackDescription } from '../../media/index.js';
import { type RtpPacket } from '../../rtp-parser/index.js';

import type { RtspInterleavedFrame } from '../../rtsp-parser/index.js';

import type { RecordedSegmentDescriptor } from './recorded-segment-descriptor.interface.js';
import type { SequenceGap } from './sequence-gap.interface.js';
/**
 * Parsed stored RTP or RTCP frame with timing and gap information.
 */
export interface RecordedPacket<TSegmentRef = unknown> {
  /** Recording segment being written or played. */
  readonly segment: RecordedSegmentDescriptor<TSegmentRef>;
  /** Byte offset from the start of the stored media file. */
  readonly byteOffset: number;
  /** Decoded or encoded frame delivered by this operation. */
  readonly frame: RtspInterleavedFrame;
  /** Parsed RTP packet for this event. */
  readonly rtp?: RtpPacket;
  /** Negotiated media track associated with this packet. */
  readonly track?: TrackDescription;
  /** Corresponding Unix wall-clock time in milliseconds. */
  readonly wallClockTimeMs: number;
  /** Lost packet count and expected/actual sequence numbers before this packet. */
  readonly sequenceGap?: SequenceGap;
  /** Whether a source or timing change precedes this packet. */
  readonly discontinuity: boolean;
}
