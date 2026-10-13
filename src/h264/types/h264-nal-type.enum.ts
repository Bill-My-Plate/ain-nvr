/** NAL unit types used by this module when inspecting H.264 RTP payloads. */
export const enum H264NalType {
  /** A coded picture slice that is not part of an IDR picture. */
  NonIdrSlice = 1,
  /** A slice of an instantaneous decoding refresh (IDR) picture. */
  IdrSlice = 5,
  /** Supplemental enhancement information, such as timing metadata. */
  Sei = 6,
  /** Sequence parameter set: stream-wide decoder parameters. */
  Sps = 7,
  /** Picture parameter set: parameters used to decode pictures. */
  Pps = 8,
  /** Single-time aggregation packet containing length-prefixed NAL units. */
  StapA = 24,
  /** Fragmentation unit carrying part of one NAL unit. */
  FuA = 28,
}
