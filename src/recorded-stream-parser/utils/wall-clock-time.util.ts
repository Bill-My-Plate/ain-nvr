import { RECORDED_STREAM_CONSTANTS } from '../constants/recorded-stream-parser-numeric-values.constant.js';
import type { TrackDescription } from '../../media/index.js';

import type { ClockAnchor } from '../types/clock-anchor.interface.js';
import type { RecordedSegmentDescriptor } from '../types/recorded-segment-descriptor.interface.js';
import { signedTimestampDelta } from './signed-timestamp-delta.util.js';
/**
 * Maps a recorded RTP timestamp to Unix time using segment clock anchors.
 */
export function wallClockTime(
  segment: RecordedSegmentDescriptor,
  track: TrackDescription,
  byteOffset: number,
  rtpTimestamp: number,
): number {
  let anchor: ClockAnchor | undefined;
  for (const candidate of segment.clockAnchors) {
    if (candidate.trackId !== track.trackId) continue;
    if (candidate.byteOffset <= byteOffset) anchor = candidate;
    else if (anchor === undefined) anchor = candidate;
    else break;
  }
  return anchor === undefined
    ? segment.startTimeMs
    : anchor.timeMs +
        (signedTimestampDelta(rtpTimestamp, anchor.rtpTimestamp) *
          RECORDED_STREAM_CONSTANTS.millisecondsPerSecond) /
          track.clockRate;
}
