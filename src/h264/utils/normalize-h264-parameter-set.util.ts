


import { splitH264NalUnits } from './split-h264-nal-units.util.js';
import { validNal } from './valid-nal.util.js';

export function normalizeH264ParameterSet(data: Buffer, expectedType: 7 | 8): Buffer {
  const match = splitH264NalUnits(data).find((nal) => validNal(nal, expectedType));
  if (match === undefined) {
    throw new Error(`H.264 configuration does not contain NAL type ${expectedType}.`);
  }
  return match;
}
