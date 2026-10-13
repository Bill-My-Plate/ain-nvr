import type { H264SpsInfo } from '../types/h264-sps-info.interface.js';
import { H264SpsError } from '../errors/h264-sps-error.class.js';
import { BitReader } from '../services/bit-reader.class.js';
import { removeEmulationPrevention } from './remove-emulation-prevention.util.js';
import { skipScalingList } from './skip-scaling-list.util.js';
import { HIGH_PROFILES } from '../constants/high-profiles.constant.js';
import { H264_NAL_LAYOUT } from '../constants/h264-nal-layout.constant.js';
import { H264_SPS_LAYOUT } from '../constants/h264-sps-layout.constant.js';
import { H264_SCALING_LIST_LAYOUT } from '../constants/h264-scaling-list-layout.constant.js';
import { H264NalType } from '../types/h264-nal-type.enum.js';

/**
 * Read codec identity and displayed dimensions from one complete, raw SPS NAL.
 * Input starts with the NAL header, then profile_idc, constraint flags, and
 * level_idc, followed by the SPS bitstream. Do not include an Annex-B start code.
 */
export function parseH264Sps(nal: Buffer): H264SpsInfo {
  if (nal.length < H264_SPS_LAYOUT.minimumNalBytes
    || ((nal[H264_NAL_LAYOUT.headerByteOffset] ?? 0) & H264_NAL_LAYOUT.typeMask)
      !== H264NalType.Sps) {
    throw new H264SpsError('Input is not a complete H.264 SPS NAL unit.');
  }
  const profileIdc = nal[H264_SPS_LAYOUT.profileIdcOffset] ?? 0;
  const constraintFlags = nal[H264_SPS_LAYOUT.constraintFlagsOffset] ?? 0;
  const levelIdc = nal[H264_SPS_LAYOUT.levelIdcOffset] ?? 0;
  // SPS syntax after the fixed header uses Exp-Golomb fields in RBSP form.
  // Remove emulation-prevention bytes before reading individual bits.
  const reader = new BitReader(removeEmulationPrevention(nal.subarray(H264_SPS_LAYOUT.rbspOffset)));
  reader.readUnsignedExpGolomb();

  let chromaFormatIdc: number = H264_SPS_LAYOUT.defaultChromaFormatIdc;
  let separateColourPlaneFlag = 0;
  // High profiles carry extra chroma and scaling-list syntax before dimensions.
  if (HIGH_PROFILES.has(profileIdc)) {
    chromaFormatIdc = reader.readUnsignedExpGolomb();
    if (chromaFormatIdc > H264_SPS_LAYOUT.maximumChromaFormatIdc) {
      throw new H264SpsError('Unsupported SPS chroma format.');
    }
    if (chromaFormatIdc === H264_SPS_LAYOUT.chroma444FormatIdc) {
      separateColourPlaneFlag = reader.readBit();
    }
    reader.readUnsignedExpGolomb();
    reader.readUnsignedExpGolomb();
    reader.readBit();
    if (reader.readBit() === 1) {
      const count = chromaFormatIdc === H264_SPS_LAYOUT.chroma444FormatIdc
        ? H264_SCALING_LIST_LAYOUT.chroma444ListCount
        : H264_SCALING_LIST_LAYOUT.listCount;
      for (let index = 0; index < count; index += 1) {
        if (reader.readBit() === 1) {
          skipScalingList(reader, index < H264_SCALING_LIST_LAYOUT.smallListCount
            ? H264_SCALING_LIST_LAYOUT.smallListEntries
            : H264_SCALING_LIST_LAYOUT.largeListEntries);
        }
      }
    }
  }

  // Skip sequence parameters that precede picture order and frame size.
  reader.readUnsignedExpGolomb();
  const picOrderCountType = reader.readUnsignedExpGolomb();
  if (picOrderCountType === H264_SPS_LAYOUT.picOrderCountLsbType) {
    reader.readUnsignedExpGolomb();
  } else if (picOrderCountType === H264_SPS_LAYOUT.picOrderCountDeltaType) {
    reader.readBit();
    reader.readSignedExpGolomb();
    reader.readSignedExpGolomb();
    const cycle = reader.readUnsignedExpGolomb();
    for (let index = 0; index < cycle; index += 1) {
      reader.readSignedExpGolomb();
    }
  } else if (picOrderCountType > H264_SPS_LAYOUT.maximumPicOrderCountType) {
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
  // Frame cropping is expressed in chroma-dependent units, not pixels.
  if (reader.readBit() === 1) {
    cropLeft = reader.readUnsignedExpGolomb();
    cropRight = reader.readUnsignedExpGolomb();
    cropTop = reader.readUnsignedExpGolomb();
    cropBottom = reader.readUnsignedExpGolomb();
  }

  // Convert macroblock dimensions to pixels, then subtract the display crop.
  const chromaArrayType = separateColourPlaneFlag === 1 ? 0 : chromaFormatIdc;
  const subWidthC = chromaArrayType === H264_SPS_LAYOUT.chroma420FormatIdc
    || chromaArrayType === H264_SPS_LAYOUT.chroma422FormatIdc
    ? H264_SPS_LAYOUT.chromaSubsamplingFactor : H264_SPS_LAYOUT.unsubsampledFactor;
  const subHeightC = chromaArrayType === H264_SPS_LAYOUT.chroma420FormatIdc
    ? H264_SPS_LAYOUT.chromaSubsamplingFactor : H264_SPS_LAYOUT.unsubsampledFactor;
  const cropUnitX = chromaArrayType === 0 ? H264_SPS_LAYOUT.unsubsampledFactor : subWidthC;
  const cropUnitY = chromaArrayType === 0
    ? H264_SPS_LAYOUT.mapUnitsPerFrame - frameMbsOnlyFlag
    : subHeightC * (H264_SPS_LAYOUT.mapUnitsPerFrame - frameMbsOnlyFlag);
  const codedWidth = (picWidthInMbsMinus1 + 1) * H264_SPS_LAYOUT.macroblockPixels
    - (cropLeft + cropRight) * cropUnitX;
  const codedHeight = (picHeightInMapUnitsMinus1 + 1) * H264_SPS_LAYOUT.macroblockPixels
    * (H264_SPS_LAYOUT.mapUnitsPerFrame - frameMbsOnlyFlag)
    - (cropTop + cropBottom) * cropUnitY;
  if (codedWidth <= 0 || codedHeight <= 0) {
    throw new H264SpsError('SPS produces invalid coded dimensions.');
  }

  const codec = `avc1.${profileIdc.toString(H264_SPS_LAYOUT.codecHexRadix)
    .padStart(H264_SPS_LAYOUT.codecHexDigitsPerByte, '0')}${constraintFlags
    .toString(H264_SPS_LAYOUT.codecHexRadix)
    .padStart(H264_SPS_LAYOUT.codecHexDigitsPerByte, '0')}${levelIdc
    .toString(H264_SPS_LAYOUT.codecHexRadix)
    .padStart(H264_SPS_LAYOUT.codecHexDigitsPerByte, '0')}`;
  return { profileIdc, constraintFlags, levelIdc, codec, codedWidth, codedHeight };
}
