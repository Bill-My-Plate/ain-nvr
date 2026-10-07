

import { type H264CodecConfiguration } from '../../h264/index.js';






export type RecordingIndexEvent<TLocation> =
  | {
      readonly type: 'packet';
      readonly location: TLocation;
      readonly trackId?: string;
      readonly timeMs: number;
      readonly byteLength: number;
    }
  | {
      readonly type: 'keyframe';
      readonly location: TLocation;
      readonly trackId: string;
      readonly timeMs: number;
      readonly rtpTimestamp: number;
      readonly sequenceNumber: number;
    }
  | {
      readonly type: 'playpoint';
      readonly location: TLocation;
      readonly timeMs: number;
    }
  | {
      readonly type: 'clock-anchor';
      readonly location: TLocation;
      readonly trackId: string;
      readonly source: 'arrival' | 'rtcp-sr';
      readonly timeMs: number;
      readonly rtpTimestamp: number;
    }
  | {
      readonly type: 'configuration';
      readonly trackId: string;
      readonly configuration: H264CodecConfiguration;
    }
  | {
      readonly type: 'discontinuity';
      readonly location: TLocation;
      readonly trackId: string;
      readonly reason: 'source-reconnect' | 'ssrc-change' | 'timestamp-reset';
    };
