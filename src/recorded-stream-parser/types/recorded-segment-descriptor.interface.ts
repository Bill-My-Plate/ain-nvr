import type { TrackDescription } from '../../media/index.js';

import type { RecordedByteSource } from './recorded-byte-source.interface.js';
import type { ClockAnchor } from './clock-anchor.interface.js';
/**
 * Track mapping, source, and clock metadata for a stored segment.
 */
export interface RecordedSegmentDescriptor<TSegmentRef = unknown> {
  /** Host-owned reference identifying this stored segment. */
  readonly ref: TSegmentRef;
  /**
   * Identifier of the RTSP or recording session.
   */
  readonly sessionId: string;
  /** Start time in milliseconds. */
  readonly startTimeMs: number;
  /** End time in milliseconds. */
  readonly endTimeMs: number;
  /** Whether this item follows a source or timing discontinuity. */
  readonly discontinuityBefore: boolean;
  /** Producer of packets, bytes, or segments consumed by this operation. */
  readonly source: RecordedByteSource;
  /** Track descriptions participating in this session. */
  readonly tracks: readonly TrackDescription[];
  /** RTP-to-wall-clock reference points from RTCP or the recording index. */
  readonly clockAnchors: readonly ClockAnchor[];
}
