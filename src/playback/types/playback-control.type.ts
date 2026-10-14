import type { H264CodecConfiguration } from '../../h264/index.js';
/**
 * Control event such as a gap or session change in playback.
 */
export type PlaybackControl =
  | {
      /** Discriminant identifying this command, event, or message variant. */
      readonly kind: 'ready';
      /** Requested time in milliseconds. */
      readonly requestedTimeMs: number;
      /** Actual start time in milliseconds. */
      readonly actualStartTimeMs: number;
      /** Codec or runtime configuration currently applied. */
      readonly configuration: H264CodecConfiguration;
    }
  | {
      /** Discriminant identifying this command, event, or message variant. */
      readonly kind: 'configuration';
      /** Codec or runtime configuration currently applied. */
      readonly configuration: H264CodecConfiguration;
      /** Media timestamp in microseconds. */
      readonly timestampUs: number;
    }
  | {
      /** Discriminant identifying this command, event, or message variant. */
      readonly kind: 'end';
      /** Reason for the recording or playback boundary. */
      readonly reason: 'end-of-recording' | 'incompatible-session' | 'recording-gap';
    };
