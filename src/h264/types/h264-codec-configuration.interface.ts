


import type { H264DecoderConfiguration } from './h264-decoder-configuration.interface.js';
import type { H264ParameterSets } from './h264-parameter-sets.type.js';

export interface H264CodecConfiguration extends H264ParameterSets {
  readonly decoder: H264DecoderConfiguration;
  readonly signature: string;
}
