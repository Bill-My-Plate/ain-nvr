import type { ExtractedJpegFrame } from '../frame-extractor/index.js';


export interface FrameOptions {
  readonly framesPerSecond?: number;
  readonly jpegQuality?: number;
  readonly onFrame: (frame: ExtractedJpegFrame) => Promise<void> | void;
  readonly onError: (error: Error) => void;
}
