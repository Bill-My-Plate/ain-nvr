import type { LibavFrameLike } from './libav-frame-like.type.js';
import type { LibavFormatContextLike } from './libav-format-context-like.type.js';
/**
 * Initialization, format-context creation, and JPEG encoding contract.
 */
export type LibavRuntime = {
  /** libav bit flag that identifies a key packet. */
  readonly keyPacketFlag: number;
  /**
   * Loads and initializes the libav runtime.
   */
  initialize(): Promise<void>;
  /**
   * Creates a libav demuxing context.
   */
  createFormatContext(): LibavFormatContextLike;
  /**
   * Encodes a decoded frame as JPEG bytes.
   */
  toJpeg(frame: LibavFrameLike, quality: number): Promise<Buffer>;
};
