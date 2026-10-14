/**
 * Potential hardware or software decoder for a codec.
 */
export interface DecoderCandidate {
  /** Human-readable decoder candidate name. */
  readonly label: string;
  /** Hardware device type required by this decoder. */
  readonly hardwareDevice?: string;
  /** Decoder selection or current decoder state. */
  readonly decoder?: string;
  /** Device name passed to the native decoder. */
  readonly deviceName?: string;
}
