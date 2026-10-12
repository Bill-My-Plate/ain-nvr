/** Waiting limits for one RTP sequence stream. */
export const RTP_REORDER_WINDOW = {
  defaultPackets: 4,
  minimumPackets: 1,
  /** Must be less than half the 16-bit sequence space to identify late packets. */
  maximumPackets: 0x7fff,
} as const;
