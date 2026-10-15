import type { ExtractedJpegFrame } from './extracted-jpeg-frame.interface.js';
import type { LibavRuntime } from './libav-runtime.type.js';

/** Dependencies and status hooks for one session's bounded JPEG delivery queue. */
export type FrameJpegQueueOptions = {
  /** Runtime that encodes a native frame to JPEG. */
  readonly runtime: LibavRuntime;
  /** JPEG quality passed to the runtime. */
  readonly jpegQuality: number;
  /** Consumer callback for each encoded frame. */
  readonly onFrame: (frame: ExtractedJpegFrame) => Promise<void> | void;
  /** Allocates the next extractor-wide frame number. */
  readonly nextFrameNumber: () => number;
  /** Records a successfully delivered JPEG. */
  readonly onEmitted: () => void;
  /** Records a frame rejected because the queue is full. */
  readonly onDropped: () => void;
};
