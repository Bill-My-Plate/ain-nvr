
import { parseH264Sps } from './parse-h264-sps.util.js';

import type { H264CodecConfiguration } from '../types/h264-codec-configuration.interface.js';
import { splitH264NalUnits } from './split-h264-nal-units.util.js';
import { validNal } from './valid-nal.util.js';

export function createH264CodecConfiguration(
  spsData: Buffer,
  ppsData: Buffer,
): H264CodecConfiguration {
  const combined = [...splitH264NalUnits(spsData), ...splitH264NalUnits(ppsData)];
  const sps = combined.find((nal) => validNal(nal, 7));
  const pps = combined.find((nal) => validNal(nal, 8));
  if (sps === undefined || pps === undefined) {
    throw new Error('H.264 configuration requires valid SPS and PPS NAL units.');
  }
  const info = parseH264Sps(sps);
  const normalizedSps = Buffer.from(sps);
  const normalizedPps = Buffer.from(pps);
  return {
    sps: normalizedSps,
    pps: normalizedPps,
    decoder: {
      codec: info.codec,
      codedWidth: info.codedWidth,
      codedHeight: info.codedHeight,
      bitstreamFormat: 'annexb',
    },
    signature: `${normalizedSps.toString('base64')}:${normalizedPps.toString('base64')}`,
  };
}
