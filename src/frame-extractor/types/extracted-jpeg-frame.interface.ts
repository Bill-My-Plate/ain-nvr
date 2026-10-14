/**
 * Encoded JPEG bytes with capture timing and source frame metadata.
 */
export interface ExtractedJpegFrame {
  /** Encoded JPEG bytes delivered to the frame subscriber. */
  readonly data: Buffer;
  /** Monotonic frame number within this stream. */
  readonly frameNumber: number;
  /** Unix millisecond time at which the frame was captured. */
  readonly captureTimeMs: number;
  /** Frame width in pixels. */
  readonly width: number;
  /** Frame height in pixels. */
  readonly height: number;
  /** Decoder selection or current decoder state. */
  readonly decoder: string;
}
