/** SPS scaling-list counts, entry counts, and arithmetic. */
export const H264_SCALING_LIST_LAYOUT = {
  defaultScale: 8,
  scaleModulus: 256,
  listCount: 8,
  chroma444ListCount: 12,
  smallListCount: 6,
  smallListEntries: 16,
  largeListEntries: 64,
} as const;
