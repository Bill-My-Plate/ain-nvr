import type { StartCode } from '../types/start-code.type.js';
import { H264_ANNEX_B_LAYOUT } from '../constants/h264-annex-b-layout.constant.js';
/**
 * Find the 00 00 01 and 00 00 00 01 delimiters in an Annex-B byte stream.
 * Returns each delimiter's byte offset and length; NAL bytes follow it.
 * @param data Variable-length Annex B byte stream; NAL boundaries are marked by `00 00 01` or `00 00 00 01` sequences.
 */
export function findStartCodes(data: Buffer): StartCode[] {
  const result: StartCode[] = [];
  for (let offset = 0; offset + H264_ANNEX_B_LAYOUT.shortStartCodeBytes <= data.length; ) {
    const firstByteIsZero =
      data[offset + H264_ANNEX_B_LAYOUT.firstByteOffset] === H264_ANNEX_B_LAYOUT.zeroByte;
    const secondByteIsZero =
      data[offset + H264_ANNEX_B_LAYOUT.secondByteOffset] === H264_ANNEX_B_LAYOUT.zeroByte;
    const thirdByteIsZero =
      data[offset + H264_ANNEX_B_LAYOUT.shortMarkerOffset] === H264_ANNEX_B_LAYOUT.zeroByte;
    const thirdByteIsMarker =
      data[offset + H264_ANNEX_B_LAYOUT.shortMarkerOffset] === H264_ANNEX_B_LAYOUT.markerByte;
    const fourthByteIsMarker =
      data[offset + H264_ANNEX_B_LAYOUT.longMarkerOffset] === H264_ANNEX_B_LAYOUT.markerByte;
    const hasZeroPrefix = firstByteIsZero && secondByteIsZero;

    if (hasZeroPrefix && thirdByteIsZero && fourthByteIsMarker) {
      result.push({ offset, length: H264_ANNEX_B_LAYOUT.longStartCodeBytes });
      offset += H264_ANNEX_B_LAYOUT.longStartCodeBytes;
    } else if (hasZeroPrefix && thirdByteIsMarker) {
      result.push({ offset, length: H264_ANNEX_B_LAYOUT.shortStartCodeBytes });
      offset += H264_ANNEX_B_LAYOUT.shortStartCodeBytes;
    } else {
      offset += 1;
    }
  }
  return result;
}
