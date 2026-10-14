import { type RecordedSegmentDescriptor } from '../../recorded-stream-parser/index.js';
/**
 * Stored segment descriptor available to the playback source.
 */
export type PlaybackSegment<TSegmentRef> = RecordedSegmentDescriptor<TSegmentRef>;
