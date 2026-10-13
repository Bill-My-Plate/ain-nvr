import { H264SpsError } from '../errors/h264-sps-error.class.js';
import { H264_BIT_READER_LAYOUT } from '../constants/h264-bit-reader-layout.constant.js';

/** Read SPS RBSP bytes most-significant bit first, advancing after each read. */
export class BitReader {
  private bitOffset = 0;

  /** `data` is the SPS bitstream after its NAL header and prevention bytes. */
  constructor(private readonly data: Buffer) {}

  /** Read one bit; fail if the SPS ends before it is available. */
  public readBit(): number {
    if (this.bitOffset >= this.data.length * H264_BIT_READER_LAYOUT.bitsPerByte) {
      throw new H264SpsError('SPS bitstream is truncated.');
    }
    const byte = this.data[this.bitOffset >>> H264_BIT_READER_LAYOUT.byteIndexShift] ?? 0;
    const bit = (byte >>> (H264_BIT_READER_LAYOUT.lastBitIndex
      - (this.bitOffset & H264_BIT_READER_LAYOUT.bitIndexMask))) & 1;
    this.bitOffset += 1;
    return bit;
  }

  /** Read up to the configured safe number of bits as an unsigned integer. */
  public readBits(count: number): number {
    if (!Number.isInteger(count) || count < 0 || count > H264_BIT_READER_LAYOUT.maximumReadBits) {
      throw new RangeError(`Bit count must be between 0 and ${H264_BIT_READER_LAYOUT.maximumReadBits}.`);
    }
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      value = value * 2 + this.readBit();
    }
    return value;
  }

  /** Decode ue(v): count leading zero bits, then read that many suffix bits. */
  public readUnsignedExpGolomb(): number {
    let leadingZeros = 0;
    while (this.readBit() === 0) {
      leadingZeros += 1;
      if (leadingZeros > H264_BIT_READER_LAYOUT.maximumExpGolombLeadingZeros) {
        throw new H264SpsError('SPS Exp-Golomb value is too large.');
      }
    }
    if (leadingZeros === 0) {
      return 0;
    }
    return 2 ** leadingZeros - 1 + this.readBits(leadingZeros);
  }

  /** Decode se(v), mapping successive codes to 0, 1, -1, 2, -2, ... */
  public readSignedExpGolomb(): number {
    const code = this.readUnsignedExpGolomb();
    return (code & 1) === 0 ? -(code / 2) : (code + 1) / 2;
  }
}
