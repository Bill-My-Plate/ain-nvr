/**
 * Encoded libav packet fields and native release operation.
 */
export type LibavPacketLike = {
  /** Index of the demuxed stream that produced this packet. */
  readonly streamIndex: number;
  /** Codec packet flags, including the key-packet bit. */
  readonly flags: number;
  /** Encoded packet size in bytes. */
  readonly size?: number;
  /**
   * Releases the native libav packet, frame, or decoder resource.
   */
  destroy(): void;
};
