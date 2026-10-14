import { type H264ParameterSets } from './h264-parameter-sets.type.js';
/** Stream parameters and optional decoder bootstrap for access-unit assembly. */
export interface H264AccessUnitAssemblerOptions {
  /** Expected 7-bit RTP payload type; packets with another type are ignored. */
  readonly payloadType: number;
  /** RTP timestamp ticks per second for this video track. */
  readonly clockRate: number;
  /** Initial SPS/PPS, usually supplied by SDP; in-band sets can replace them. */
  readonly parameterSets?: H264ParameterSets;
  /** If set, emitted timestamps use wall-clock time relative to this time in ms. */
  readonly playbackStartTimeMs?: number;
}
