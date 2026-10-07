


import type { TrackCodec } from './track-codec.type.js';
import type { StoredParameterSets } from './stored-parameter-sets.type.js';
import type { StoredWebCodecInfo } from './stored-web-codec-info.type.js';

export type SessionTrack = {
  trackId: string;
  mediaType: 'video' | 'audio';
  codec: TrackCodec;
  clockRate: number;
  payloadType: number;
  control: string;
  rtpChannel: number;
  rtcpChannel: number;
  fmtp?: string;
  webCodec?: StoredWebCodecInfo;
  parameterSetsBase64?: StoredParameterSets;
};
