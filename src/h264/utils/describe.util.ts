import { H264NalType } from '../types/h264-nal-type.enum.js';
import type { H264Packetization } from '../types/h264-packetization.type.js';
import type { H264PayloadInspection } from '../types/h264-payload-inspection.interface.js';
/**
 * Summarize inspected NALs and optional FU-A fragment details for callers.
 * @param nalUnits H.264 bytes with a one-byte NAL header (forbidden bit, two priority bits, five type bits). Annex B sequences may have three- or four-byte start codes; NAL body size varies by frame.
 */
export function describe(
  packetization: H264Packetization,
  nalTypes: number[],
  nalUnits: Buffer[],
  extras: Partial<
    Pick<H264PayloadInspection, 'fuStart' | 'fuEnd' | 'reconstructedFuHeader' | 'fuPayload'>
  > = {},
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
