import { type H264CodecConfiguration } from '../../h264/index.js';
/**
 * An event produced by recording parser.
 */
export type RecordingIndexEvent<TLocation> =
  | {
      /** Discriminant or media type used to interpret this value. */
      readonly type: 'packet';
      /** Location of the packet in a stored segment. */
      readonly location: TLocation;
      /** Identifier of the negotiated media track. */
      readonly trackId?: string;
      /** Time in Unix milliseconds. */
      readonly timeMs: number;
      /** Number of bytes in the indexed packet. */
      readonly byteLength: number;
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      readonly type: 'keyframe';
      /** Location of the packet in a stored segment. */
      readonly location: TLocation;
      /**
       * Identifier of the negotiated media track.
       */
      readonly trackId: string;
      /** Time in Unix milliseconds. */
      readonly timeMs: number;
      /** RTP timestamp in the track clock rate; it is not Unix time. */
      readonly rtpTimestamp: number;
      /** Unsigned RTP sequence number, wrapping after 65535. */
      readonly sequenceNumber: number;
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      readonly type: 'playpoint';
      /** Location of the packet in a stored segment. */
      readonly location: TLocation;
      /** Time in Unix milliseconds. */
      readonly timeMs: number;
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      readonly type: 'clock-anchor';
      /** Location of the packet in a stored segment. */
      readonly location: TLocation;
      /**
       * Identifier of the negotiated media track.
       */
      readonly trackId: string;
      /** Producer of packets, bytes, or segments consumed by this operation. */
      readonly source: 'arrival' | 'rtcp-sr';
      /** Time in Unix milliseconds. */
      readonly timeMs: number;
      /** RTP timestamp in the track clock rate; it is not Unix time. */
      readonly rtpTimestamp: number;
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      readonly type: 'configuration';
      /**
       * Identifier of the negotiated media track.
       */
      readonly trackId: string;
      /** Codec or runtime configuration currently applied. */
      readonly configuration: H264CodecConfiguration;
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      readonly type: 'discontinuity';
      /** Location of the packet in a stored segment. */
      readonly location: TLocation;
      /**
       * Identifier of the negotiated media track.
       */
      readonly trackId: string;
      /** Reason for the recording or playback boundary. */
      readonly reason: 'source-reconnect' | 'ssrc-change' | 'timestamp-reset';
    };
