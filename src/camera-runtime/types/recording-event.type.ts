import type { CommittedSegment } from '../../recording-storage/index.js';
/**
 * An event produced by camera runtime.
 */
export type RecordingEvent =
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'committed';
      /** Recording segment being written or played. */
      segment: CommittedSegment;
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'session-closed';
      /**
       * Stable identifier of the camera associated with this value.
       */
      cameraId: string;
      /** Unix millisecond time at which the session began. */
      sessionStartMs: number;
    };
