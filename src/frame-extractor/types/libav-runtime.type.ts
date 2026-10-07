import type { LibavFrameLike } from './libav-frame-like.type.js';
import type { LibavFormatContextLike } from './libav-format-context-like.type.js';

export type LibavRuntime = {
  readonly keyPacketFlag: number;
  initialize(): Promise<void>;
  createFormatContext(): LibavFormatContextLike;
  toJpeg(frame: LibavFrameLike, quality: number): Promise<Buffer>;
};
