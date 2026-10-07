import type { TrackDescription } from '../../media/index.js';





import type { RecordedByteSource } from './recorded-byte-source.interface.js';
import type { ClockAnchor } from './clock-anchor.interface.js';

export interface RecordedSegmentDescriptor<TSegmentRef = unknown> {
  readonly ref: TSegmentRef;
  readonly sessionId: string;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly discontinuityBefore: boolean;
  readonly source: RecordedByteSource;
  readonly tracks: readonly TrackDescription[];
  readonly clockAnchors: readonly ClockAnchor[];
}
