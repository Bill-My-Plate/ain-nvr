import type { H264ParameterSets } from '../h264/index.js';

export interface TrackDescription {
  readonly trackId: string;
  readonly mediaType: 'video' | 'audio';
  readonly codec: 'h264' | 'pcmu' | 'pcma';
  readonly payloadType: number;
  readonly clockRate: number;
  readonly rtpChannel: number;
  readonly rtcpChannel: number;
  readonly parameterSets?: H264ParameterSets;
}
