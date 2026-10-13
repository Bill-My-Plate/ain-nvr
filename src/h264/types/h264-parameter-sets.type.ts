


/** SPS/PPS NAL units used to configure an H.264 decoder. */
export type H264ParameterSets = {
  /** Sequence parameter set NAL data. */
  readonly sps: Buffer;
  /** Picture parameter set NAL data. */
  readonly pps: Buffer;
};
