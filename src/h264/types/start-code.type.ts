/** Location of a three- or four-byte Annex-B start code in a buffer. */
export type StartCode = {
  /** Zero-based byte position where the start code begins. */
  readonly offset: number;
  /** Number of bytes in this Annex B start code. */
  readonly length: 3 | 4;
};
