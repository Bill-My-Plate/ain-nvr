import { H264NalType } from '../types/h264-nal-type.enum.js';
import type { H264PayloadInspection } from '../types/h264-payload-inspection.interface.js';
import { H264PayloadError } from '../errors/h264-payload-error.class.js';
import { describe } from './describe.util.js';
import { validateNalHeader } from './validate-nal-header.util.js';

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
