/** The 16-bit sequence-number space shared by RTP ordering helpers. */
export const RTP_SEQUENCE_SPACE = {
  minimum: 0,
  maximum: 0xffff,
  mask: 0xffff,
  halfRange: 0x8000,
  size: 0x1_0000,
  nextPacketStep: 1,
} as const;
