/** Three- and four-byte Annex-B start-code positions and marker bytes. */
export const H264_ANNEX_B_LAYOUT = {
  zeroByte: 0,
  markerByte: 1,
  shortStartCodeBytes: 3,
  longStartCodeBytes: 4,
  firstByteOffset: 0,
  secondByteOffset: 1,
  shortMarkerOffset: 2,
  longMarkerOffset: 3,
} as const;
