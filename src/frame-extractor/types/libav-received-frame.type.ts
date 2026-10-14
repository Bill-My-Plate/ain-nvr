import type { LibavFrameLike } from './libav-frame-like.type.js';
/**
 * Decoded frame paired with its stream and timing information.
 */
export type LibavReceivedFrame = LibavFrameLike & {
  /** Discriminant or media type used to interpret this value. */
  readonly type: 'frame';
  /** Demuxed stream index that produced this frame. */
  readonly streamIndex: number;
};
