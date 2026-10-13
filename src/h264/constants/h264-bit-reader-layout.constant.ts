/** Bit positions and supported read widths for SPS bitstream parsing. */
export const H264_BIT_READER_LAYOUT = {
  bitsPerByte: 8,
  byteIndexShift: 3,
  bitIndexMask: 7,
  lastBitIndex: 7,
  maximumReadBits: 32,
  maximumExpGolombLeadingZeros: 31,
} as const;
