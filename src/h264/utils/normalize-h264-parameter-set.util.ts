import { splitH264NalUnits } from './split-h264-nal-units.util.js';
import { validNal } from './valid-nal.util.js';
import { H264NalType } from '../types/h264-nal-type.enum.js';
/**
 * Extract the first valid SPS (type 7) or PPS (type 8) from raw NAL bytes or
 * an Annex-B sequence. The returned buffer excludes any start code.
 * @param data One SPS/PPS NAL with a one-byte NAL header, optionally preceded by a three- or four-byte Annex B start code. The NAL body has variable length.
 */
export function normalizeH264ParameterSet(
  data: Buffer,
  expectedType: H264NalType.Sps | H264NalType.Pps,
): Buffer {
  const match = splitH264NalUnits(data).find((nal) => validNal(nal, expectedType));
  if (match === undefined) {
    throw new Error(`H.264 configuration does not contain NAL type ${expectedType}.`);
  }
  return match;
}
