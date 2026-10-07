
import { type H264ParameterSets } from './h264-parameter-sets.type.js';



export interface H264AccessUnitAssemblerOptions {
  readonly payloadType: number;
  readonly clockRate: number;
  readonly parameterSets?: H264ParameterSets;
  readonly playbackStartTimeMs?: number;
}
