import type { RecordingConfiguration } from './recording-configuration.type.js';
import type { FrameProfile } from './frame-profile.type.js';
/**
 * Worker command requesting recording, frames, a boundary, stop, or close.
 */
export type Command =
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'record';
      /**
       * Identifier of the recording or frame consumer.
       */
      consumerId: string;
      /** Options supplied when this consumer or command was started. */
      options: RecordingConfiguration;
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'frames';
      /**
       * Identifier of the recording or frame consumer.
       */
      consumerId: string;
      /** Frame decoding and sampling profile. */
      profile: FrameProfile;
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'stop';
      /**
       * Identifier of the recording or frame consumer.
       */
      consumerId: string;
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'boundary';
      /**
       * Identifier of the recording or frame consumer.
       */
      consumerId: string;
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'close';
    };
