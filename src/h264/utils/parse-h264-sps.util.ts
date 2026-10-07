import type { H264SpsInfo } from '../types/h264-sps-info.interface.js';
import { H264SpsError } from '../errors/h264-sps-error.class.js';
import { BitReader } from '../services/bit-reader.class.js';
import { removeEmulationPrevention } from './remove-emulation-prevention.util.js';
import { skipScalingList } from './skip-scaling-list.util.js';
import { HIGH_PROFILES } from '../constants/high-profiles.constant.js';

export function parseH264Sps(nal: Buffer): H264SpsInfo {
  if (nal.length < 4 || ((nal[0] ?? 0) & 0x1f) !== 7) {
    throw new H264SpsError('Input is not a complete H.264 SPS NAL unit.');
  }
  const profileIdc = nal[1] ?? 0;
  const constraintFlags = nal[2] ?? 0;
  const levelIdc = nal[3] ?? 0;
  const reader = new BitReader(removeEmulationPrevention(nal.subarray(4)));
  reader.readUnsignedExpGolomb();

  let chromaFormatIdc = 1;
  let separateColourPlaneFlag = 0;
  if (HIGH_PROFILES.has(profileIdc)) {
    chromaFormatIdc = reader.readUnsignedExpGolomb();
    if (chromaFormatIdc > 3) {
      throw new H264SpsError('Unsupported SPS chroma format.');
    }
    if (chromaFormatIdc === 3) {
      separateColourPlaneFlag = reader.readBit();
    }
    reader.readUnsignedExpGolomb();
    reader.readUnsignedExpGolomb();
    reader.readBit();
    if (reader.readBit() === 1) {
      const count = chromaFormatIdc === 3 ? 12 : 8;
      for (let index = 0; index < count; index += 1) {
        if (reader.readBit() === 1) {
          skipScalingList(reader, index < 6 ? 16 : 64);
        }
      }
    }
  }

  reader.readUnsignedExpGolomb();
  const picOrderCountType = reader.readUnsignedExpGolomb();
  if (picOrderCountType === 0) {
    reader.readUnsignedExpGolomb();
  } else if (picOrderCountType === 1) {
    reader.readBit();
    reader.readSignedExpGolomb();
    reader.readSignedExpGolomb();
    const cycle = reader.readUnsignedExpGolomb();
    for (let index = 0; index < cycle; index += 1) {
      reader.readSignedExpGolomb();
    }
  } else if (picOrderCountType > 2) {
    throw new H264SpsError('Invalid SPS picture order count type.');
  }

  reader.readUnsignedExpGolomb();
  reader.readBit();
  const picWidthInMbsMinus1 = reader.readUnsignedExpGolomb();
  const picHeightInMapUnitsMinus1 = reader.readUnsignedExpGolomb();
  const frameMbsOnlyFlag = reader.readBit();
  if (frameMbsOnlyFlag === 0) {
    reader.readBit();
  }
  reader.readBit();

  let cropLeft = 0;
  let cropRight = 0;
  let cropTop = 0;
  let cropBottom = 0;
  if (reader.readBit() === 1) {
    cropLeft = reader.readUnsignedExpGolomb();
    cropRight = reader.readUnsignedExpGolomb();
    cropTop = reader.readUnsignedExpGolomb();
    cropBottom = reader.readUnsignedExpGolomb();
  }

  const chromaArrayType = separateColourPlaneFlag === 1 ? 0 : chromaFormatIdc;
  const subWidthC = chromaArrayType === 1 || chromaArrayType === 2 ? 2 : 1;
  const subHeightC = chromaArrayType === 1 ? 2 : 1;
  const cropUnitX = chromaArrayType === 0 ? 1 : subWidthC;
  const cropUnitY = chromaArrayType === 0
    ? 2 - frameMbsOnlyFlag
    : subHeightC * (2 - frameMbsOnlyFlag);
  const codedWidth = (picWidthInMbsMinus1 + 1) * 16
    - (cropLeft + cropRight) * cropUnitX;
  const codedHeight = (picHeightInMapUnitsMinus1 + 1) * 16 * (2 - frameMbsOnlyFlag)
    - (cropTop + cropBottom) * cropUnitY;
  if (codedWidth <= 0 || codedHeight <= 0) {
    throw new H264SpsError('SPS produces invalid coded dimensions.');
  }

  const codec = `avc1.${profileIdc.toString(16).padStart(2, '0')}${constraintFlags
    .toString(16).padStart(2, '0')}${levelIdc.toString(16).padStart(2, '0')}`;
  return { profileIdc, constraintFlags, levelIdc, codec, codedWidth, codedHeight };
}
