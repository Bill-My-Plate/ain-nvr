import type { RecordingIndexEvent } from '../../recording-parser/index.js';
import type { PacketLocation } from '../types/packet-location.type.js';

/** Applies a parser index event to the segment that owns its packet location. */
export function applyRecordingIndexEvent(
  event: Exclude<RecordingIndexEvent<PacketLocation>, { type: 'configuration' }>,
): void {
  const { segment, byteOffset } = event.location;
  switch (event.type) {
    case 'packet':
      segment.endTimeMs = Math.max(segment.endTimeMs, event.timeMs);
      break;
    case 'clock-anchor': {
      const anchor = {
        trackId: event.trackId,
        source: event.source,
        timeMs: event.timeMs,
        rtpTimestamp: event.rtpTimestamp,
        byteOffset,
      } as const;
      const existingIndex = segment.clockAnchors.findIndex(
        (candidate) =>
          candidate.trackId === event.trackId && candidate.byteOffset === byteOffset,
      );
      if (existingIndex < 0) segment.clockAnchors.push(anchor);
      else segment.clockAnchors[existingIndex] = anchor;
      break;
    }
    case 'playpoint':
      segment.playpoints.push({
        timeMs: event.timeMs,
        offsetMs: Math.max(0, event.timeMs - segment.startMs),
        byteOffset,
      });
      break;
    case 'keyframe':
      segment.keyframes.push({
        timeMs: event.timeMs,
        offsetMs: Math.max(0, event.timeMs - segment.startMs),
        byteOffset,
        rtpTimestamp: event.rtpTimestamp,
        sequenceNumber: event.sequenceNumber,
      });
      break;
    case 'discontinuity':
      break;
  }
}
