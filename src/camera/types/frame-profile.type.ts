/**
 * Frame sampling rate and JPEG quality shared by decoder consumers.
 */
export type FrameProfile = {
  /** Maximum number of output frames sampled per second. */
  framesPerSecond: number;
  /** JPEG encoder quality used for extracted frames. */
  jpegQuality: number;
};
