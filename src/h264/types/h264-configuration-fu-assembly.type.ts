


/** In-progress FU-A reconstruction while learning SPS/PPS configuration. */
export type FuAssembly = {
  /** RTP timestamp shared by fragments of this NAL unit. */
  readonly timestamp: number;
  /** NAL type reconstructed from the FU header. */
  readonly nalType: number;
  /** Rebuilt NAL header followed by the fragment payloads. */
  readonly chunks: Buffer[];
  /** Total reconstructed NAL bytes, used for the size limit. */
  bytes: number;
};
