
import type { RecordingOptions } from './recording-options.interface.js';

export type RecordingConfiguration = Pick<RecordingOptions,
  'cacheRoot' | 'finalRoot' | 'segmentDurationMs' | 'playpointIntervalMs' | 'minimumFreeBytes'>;
