export const enum H264NalType {
  NonIdrSlice = 1,
  IdrSlice = 5,
  Sei = 6,
  Sps = 7,
  Pps = 8,
  StapA = 24,
  FuA = 28,
}

export type H264Packetization = 'single' | 'stap-a' | 'fu-a';

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

export class H264PayloadError extends Error {
  override readonly name = 'H264PayloadError';
}

function describe(
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

function validateNalHeader(header: number): void {
  if ((header & 0x80) !== 0) {
    throw new H264PayloadError('H.264 forbidden_zero_bit is set.');
  }
}

export function inspectH264Payload(payload: Buffer): H264PayloadInspection {
  if (payload.length === 0) {
    throw new H264PayloadError('H.264 RTP payload is empty.');
  }
  const indicator = payload[0] ?? 0;
  validateNalHeader(indicator);
  const type = indicator & 0x1f;

  if (type >= 1 && type <= 23) {
    return describe('single', [type], [payload]);
  }

  if (type === H264NalType.StapA) {
    const nalUnits: Buffer[] = [];
    const nalTypes: number[] = [];
    let offset = 1;
    while (offset < payload.length) {
      if (payload.length - offset < 2) {
        throw new H264PayloadError('STAP-A NAL length is truncated.');
      }
      const length = payload.readUInt16BE(offset);
      offset += 2;
      if (length === 0 || offset + length > payload.length) {
        throw new H264PayloadError('STAP-A NAL length is invalid.');
      }
      const nal = payload.subarray(offset, offset + length);
      validateNalHeader(nal[0] ?? 0x80);
      nalUnits.push(nal);
      nalTypes.push((nal[0] ?? 0) & 0x1f);
      offset += length;
    }
    if (nalUnits.length === 0) {
      throw new H264PayloadError('STAP-A contains no NAL units.');
    }
    return describe('stap-a', nalTypes, nalUnits);
  }

  if (type === H264NalType.FuA) {
    if (payload.length < 3) {
      throw new H264PayloadError('FU-A payload is truncated.');
    }
    const fuHeader = payload[1] ?? 0;
    const fuStart = (fuHeader & 0x80) !== 0;
    const fuEnd = (fuHeader & 0x40) !== 0;
    if ((fuHeader & 0x20) !== 0 || (fuStart && fuEnd)) {
      throw new H264PayloadError('FU-A header flags are invalid.');
    }
    const reconstructedType = fuHeader & 0x1f;
    if (reconstructedType === 0 || reconstructedType >= 24) {
      throw new H264PayloadError('FU-A reconstructed NAL type is invalid.');
    }
    return describe('fu-a', [reconstructedType], [], {
      fuStart,
      fuEnd,
      reconstructedFuHeader: (indicator & 0xe0) | reconstructedType,
      fuPayload: payload.subarray(2),
    });
  }

  throw new H264PayloadError(`Unsupported H.264 RTP packetization type ${type}.`);
}
