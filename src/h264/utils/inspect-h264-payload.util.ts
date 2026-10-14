import { H264NalType } from '../types/h264-nal-type.enum.js';
import type { H264PayloadInspection } from '../types/h264-payload-inspection.interface.js';
import { H264PayloadError } from '../errors/h264-payload-error.class.js';
import { describe } from './describe.util.js';
import { validateNalHeader } from './validate-nal-header.util.js';
import { H264_NAL_LAYOUT } from '../constants/h264-nal-layout.constant.js';
/**
 * Inspect the H.264 bytes after an RTP header. Accepts one complete NAL,
 * STAP-A (1-byte indicator followed by repeated 2-byte big-endian lengths and
 * NALs), or FU-A (1-byte indicator, 1-byte FU header, then fragment bytes).
 * The RTP header itself must already have been removed.
 * @param payload One complete H.264 RTP payload. Byte zero is the NAL or aggregation/fragment indicator; STAP-A entries use two-byte big-endian NAL lengths, and FU-A uses a second fragment-header byte.
 */
export function inspectH264Payload(payload: Buffer): H264PayloadInspection {
  if (payload.length === 0) {
    throw new H264PayloadError('H.264 RTP payload is empty.');
  }
  const indicator = payload[H264_NAL_LAYOUT.headerByteOffset] ?? 0;
  validateNalHeader(indicator);
  const type = indicator & H264_NAL_LAYOUT.typeMask;

  if (type >= H264_NAL_LAYOUT.firstSingleNalType && type <= H264_NAL_LAYOUT.lastSingleNalType) {
    return describe('single', [type], [payload]);
  }

  if (type === H264NalType.StapA) {
    // Walk length-prefixed NALs; reject a truncated length or body before slicing.
    const nalUnits: Buffer[] = [];
    const nalTypes: number[] = [];
    let offset = H264_NAL_LAYOUT.headerBytes;
    while (offset < payload.length) {
      if (payload.length - offset < H264_NAL_LAYOUT.stapANalLengthBytes) {
        throw new H264PayloadError('STAP-A NAL length is truncated.');
      }
      const length = payload.readUInt16BE(offset);
      offset += H264_NAL_LAYOUT.stapANalLengthBytes;
      if (length === 0 || offset + length > payload.length) {
        throw new H264PayloadError('STAP-A NAL length is invalid.');
      }
      const nal = payload.subarray(offset, offset + length);
      validateNalHeader(
        nal[H264_NAL_LAYOUT.headerByteOffset] ?? H264_NAL_LAYOUT.forbiddenZeroBitMask,
      );
      nalUnits.push(nal);
      nalTypes.push((nal[H264_NAL_LAYOUT.headerByteOffset] ?? 0) & H264_NAL_LAYOUT.typeMask);
      offset += length;
    }
    if (nalUnits.length === 0) {
      throw new H264PayloadError('STAP-A contains no NAL units.');
    }
    return describe('stap-a', nalTypes, nalUnits);
  }

  if (type === H264NalType.FuA) {
    // Rebuild the original NAL header from the FU indicator and FU header.
    // The caller joins fragment bodies from packets that share an RTP timestamp.
    if (payload.length < H264_NAL_LAYOUT.fuMinimumPayloadBytes) {
      throw new H264PayloadError('FU-A payload is truncated.');
    }
    const fuHeader = payload[H264_NAL_LAYOUT.fuHeaderByteOffset] ?? 0;
    const fuStart = (fuHeader & H264_NAL_LAYOUT.fuStartFlag) !== 0;
    const fuEnd = (fuHeader & H264_NAL_LAYOUT.fuEndFlag) !== 0;
    if ((fuHeader & H264_NAL_LAYOUT.fuReservedFlag) !== 0 || (fuStart && fuEnd)) {
      throw new H264PayloadError('FU-A header flags are invalid.');
    }
    const reconstructedType = fuHeader & H264_NAL_LAYOUT.typeMask;
    if (reconstructedType === 0 || reconstructedType >= H264NalType.StapA) {
      throw new H264PayloadError('FU-A reconstructed NAL type is invalid.');
    }
    return describe('fu-a', [reconstructedType], [], {
      fuStart,
      fuEnd,
      reconstructedFuHeader: (indicator & H264_NAL_LAYOUT.headerPrefixMask) | reconstructedType,
      fuPayload: payload.subarray(H264_NAL_LAYOUT.fuPayloadOffset),
    });
  }

  throw new H264PayloadError(`Unsupported H.264 RTP packetization type ${type}.`);
}
