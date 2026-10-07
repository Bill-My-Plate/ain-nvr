import type { H264CodecConfiguration } from '../../h264/index.js';





export type PlaybackControl =
  | {
      readonly kind: 'ready';
      readonly requestedTimeMs: number;
      readonly actualStartTimeMs: number;
      readonly configuration: H264CodecConfiguration;
    }
  | {
      readonly kind: 'configuration';
      readonly configuration: H264CodecConfiguration;
      readonly timestampUs: number;
    }
  | {
      readonly kind: 'end';
      readonly reason: 'end-of-recording' | 'incompatible-session' | 'recording-gap';
    };
