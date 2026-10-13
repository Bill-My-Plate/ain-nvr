




/** In-progress FU-A NAL reconstruction inside the access-unit assembler. */
export type FuAssembly = {
  /** NAL type reconstructed from the FU header; fragments must match it. */
  readonly nalType: number;
  /** Rebuilt NAL header followed by the fragment payloads. */
  readonly chunks: Buffer[];
};
