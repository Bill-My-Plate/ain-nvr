/**
 * Decoded video frame fields and release operation exposed by libav.
 */
export type LibavFrameLike = {
  /** Frame width in pixels. */
  readonly width: number;
  /** Frame height in pixels. */
  readonly height: number;
  /** Hardware decoder device associated with this frame, when used. */
  readonly hardwareDeviceType?: string;
  /**
   * Releases the native libav packet, frame, or decoder resource.
   */
  destroy(): void;
};
