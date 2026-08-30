export interface H264SpsInfo {
  readonly profileIdc: number;
  readonly constraintFlags: number;
  readonly levelIdc: number;
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
}

export class H264SpsError extends Error {
  override readonly name = 'H264SpsError';
}

class BitReader {
  private bitOffset = 0;

  constructor(private readonly data: Buffer) {}

  readBit(): number {
    if (this.bitOffset >= this.data.length * 8) {
      throw new H264SpsError('SPS bitstream is truncated.');
    }
    const byte = this.data[this.bitOffset >>> 3] ?? 0;
    const bit = (byte >>> (7 - (this.bitOffset & 7))) & 1;
    this.bitOffset += 1;
    return bit;
  }

  readBits(count: number): number {
    if (!Number.isInteger(count) || count < 0 || count > 32) {
      throw new RangeError('Bit count must be between 0 and 32.');
    }
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      value = value * 2 + this.readBit();
    }
    return value;
  }

  readUnsignedExpGolomb(): number {
    let leadingZeros = 0;
    while (this.readBit() === 0) {
      leadingZeros += 1;
      if (leadingZeros > 31) {
        throw new H264SpsError('SPS Exp-Golomb value is too large.');
      }
    }
    if (leadingZeros === 0) {
      return 0;
    }
    return 2 ** leadingZeros - 1 + this.readBits(leadingZeros);
  }

  readSignedExpGolomb(): number {
    const code = this.readUnsignedExpGolomb();
    return (code & 1) === 0 ? -(code / 2) : (code + 1) / 2;
  }
}

function removeEmulationPrevention(data: Buffer): Buffer {
  const output: number[] = [];
  let zeroCount = 0;
  for (const byte of data) {
    if (zeroCount >= 2 && byte === 0x03) {
      zeroCount = 0;
      continue;
    }
    output.push(byte);
    zeroCount = byte === 0 ? zeroCount + 1 : 0;
  }
  return Buffer.from(output);
}

function skipScalingList(reader: BitReader, size: number): void {
  let lastScale = 8;
  let nextScale = 8;
  for (let index = 0; index < size; index += 1) {
    if (nextScale !== 0) {
      nextScale = (lastScale + reader.readSignedExpGolomb() + 256) % 256;
    }
    lastScale = nextScale === 0 ? lastScale : nextScale;
  }
}

const HIGH_PROFILES = new Set([44, 83, 86, 100, 110, 118, 122, 128, 134, 135, 138, 139, 244]);

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
