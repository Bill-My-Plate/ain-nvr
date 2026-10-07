import { H264SpsError } from './h264-sps-error.class.js';

export class BitReader {
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
