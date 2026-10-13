
import { type H264CodecConfiguration } from './h264-codec-configuration.interface.js';



/** One assembled H.264 access unit for a downstream decoder. */
export interface H264AccessUnit {
  /** `key` contains an IDR; `delta` is a non-IDR picture unit. */
  readonly type: 'key' | 'delta';
  /** Annex-B NAL bytes; key units include current SPS/PPS first. */
  readonly data: Buffer;
  /** RTP timestamp shared by the packets in this access unit. */
  readonly rtpTimestamp: number;
  /** Presentation time in microseconds relative to the selected origin. */
  readonly timestampUs: number;
  /** Wall-clock time assigned to the first packet of this unit, in Unix ms. */
  readonly wallClockTimeMs: number;
  /** True on a recovery key unit after a loss or stream break. */
  readonly discontinuity: boolean;
  /** Changed SPS/PPS configuration, attached to a key unit when available. */
  readonly configuration?: H264CodecConfiguration;
}
