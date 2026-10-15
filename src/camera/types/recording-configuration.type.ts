import type { RecordingOptions } from './recording-options.interface.js';
/**
 * Codec, segment, and storage settings applied to a recording consumer.
 */
export type RecordingConfiguration = Pick<
  RecordingOptions,
  'cacheRoot' | 'finalRoot' | 'segmentDurationMs' | 'playpointIntervalMs' | 'minimumFreeBytes'
>;
