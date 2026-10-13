/** H.264 NAL header bits and the RTP payload layouts supported here. */
export const H264_NAL_LAYOUT = {
  headerByteOffset: 0,
  headerBytes: 1,
  typeMask: 0x1f,
  forbiddenZeroBitMask: 0x80,
  headerPrefixMask: 0xe0,
  firstSingleNalType: 1,
  lastSingleNalType: 23,
  stapANalLengthBytes: 2,
  fuHeaderByteOffset: 1,
  fuPayloadOffset: 2,
  fuMinimumPayloadBytes: 3,
  fuStartFlag: 0x80,
  fuEndFlag: 0x40,
  fuReservedFlag: 0x20,
} as const;
