import { H264NalType } from './h264-nal-type.enum.js';
import type { H264Packetization } from './h264-packetization.type.js';
import type { H264PayloadInspection } from './h264-payload-inspection.interface.js';

export function describe(
  packetization: H264Packetization,
  nalTypes: number[],
  nalUnits: Buffer[],
  extras: Partial<Pick<H264PayloadInspection,
    'fuStart' | 'fuEnd' | 'reconstructedFuHeader' | 'fuPayload'>> = {},
): H264PayloadInspection {
  return {
    packetization,
    nalTypes,
    nalUnits,
    hasSps: nalTypes.includes(H264NalType.Sps),
    hasPps: nalTypes.includes(H264NalType.Pps),
    hasIdr: nalTypes.includes(H264NalType.IdrSlice),
    fuStart: extras.fuStart ?? false,
    fuEnd: extras.fuEnd ?? false,
    ...(extras.reconstructedFuHeader === undefined
      ? {}
      : { reconstructedFuHeader: extras.reconstructedFuHeader }),
    ...(extras.fuPayload === undefined ? {} : { fuPayload: extras.fuPayload }),
  };
}
