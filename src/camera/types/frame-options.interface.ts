import type { ExtractedJpegFrame } from '../../frame-extractor/index.js';
/**
 * Configuration options for frame.
 */
export interface FrameOptions {
  /** Maximum number of output frames sampled per second. */
  readonly framesPerSecond?: number;
  /** JPEG encoder quality used for extracted frames. */
  readonly jpegQuality?: number;
  /** Callback invoked for each accepted decoded frame. */
  readonly onFrame: (frame: ExtractedJpegFrame) => Promise<void> | void;
  /** Callback invoked when the operation fails. */
  readonly onError: (error: Error) => void;
}
