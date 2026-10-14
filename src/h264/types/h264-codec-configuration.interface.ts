import type { H264DecoderConfiguration } from './h264-decoder-configuration.interface.js';
import type { H264ParameterSets } from './h264-parameter-sets.type.js';
/** Parameter sets and decoder settings for one H.264 configuration. */
export interface H264CodecConfiguration extends H264ParameterSets {
  /** Decoder settings parsed from the SPS. */
  readonly decoder: H264DecoderConfiguration;
  /** Base64 encoding of the exact SPS and PPS bytes, used to detect changes. */
  readonly signature: string;
}
