


/** Location of a three- or four-byte Annex-B start code in a buffer. */
export type StartCode = {
  /** Zero-based byte position where the start code begins. */
  readonly offset: number;
  /** Start-code length in bytes. */
  readonly length: 3 | 4;
};
