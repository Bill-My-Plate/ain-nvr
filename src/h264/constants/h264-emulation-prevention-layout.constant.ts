/** A 0x03 byte after two zero bytes escapes a start-code pattern. */
export const H264_EMULATION_PREVENTION_LAYOUT = {
  precedingZeroBytes: 2,
  preventionByte: 0x03,
} as const;
