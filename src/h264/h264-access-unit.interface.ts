
import { type H264CodecConfiguration } from './h264-codec-configuration.interface.js';



export interface H264AccessUnit {
  readonly type: 'key' | 'delta';
  readonly data: Buffer;
  readonly rtpTimestamp: number;
  readonly timestampUs: number;
  readonly wallClockTimeMs: number;
  readonly discontinuity: boolean;
  readonly configuration?: H264CodecConfiguration;
}
