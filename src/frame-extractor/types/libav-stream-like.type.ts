/**
 * Codec and stream metadata supplied by the libav demuxer.
 */
export type LibavStreamLike = {
  /** Index of this stream within the demuxed input. */
  readonly index: number;
  /** Codec identifier for the media track. */
  readonly codec: string;
  /** Discriminant or media type used to interpret this value. */
  readonly type: string;
  /** Frame width in pixels. */
  readonly width: number;
  /** Frame height in pixels. */
  readonly height: number;
};
