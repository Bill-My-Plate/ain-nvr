


import { findStartCodes } from './find-start-codes.util.js';

/**
 * Return raw H.264 NAL units. Besides regular Annex-B, this deliberately accepts
 * the camera form `raw NAL | start code | NAL` seen inside non-standard FU-A data.
 */
export function splitH264NalUnits(data: Buffer): Buffer[] {
  if (data.length === 0) return [];
  const startCodes = findStartCodes(data);
  if (startCodes.length === 0) return [Buffer.from(data)];

  const result: Buffer[] = [];
  const first = startCodes[0];
  if (first !== undefined && first.offset > 0) {
    result.push(Buffer.from(data.subarray(0, first.offset)));
  }
  for (let index = 0; index < startCodes.length; index += 1) {
    const start = startCodes[index];
    if (start === undefined) continue;
    const next = startCodes[index + 1];
    const nalStart = start.offset + start.length;
    const nalEnd = next?.offset ?? data.length;
    if (nalEnd > nalStart) result.push(Buffer.from(data.subarray(nalStart, nalEnd)));
  }
  return result.filter((nal) => nal.length > 0);
}
