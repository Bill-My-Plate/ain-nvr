import type { H264Packetization } from './h264-packetization.type.js';

export interface H264PayloadInspection {
  readonly packetization: H264Packetization;
  readonly nalTypes: readonly number[];
  readonly nalUnits: readonly Buffer[];
  readonly hasSps: boolean;
  readonly hasPps: boolean;
  readonly hasIdr: boolean;
  readonly fuStart: boolean;
  readonly fuEnd: boolean;
  readonly reconstructedFuHeader?: number;
  readonly fuPayload?: Buffer;
}
