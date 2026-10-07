import type { LibavFrameLike } from './libav-frame-like.type.js';

export type LibavReceivedFrame = LibavFrameLike & {
  readonly type: 'frame';
  readonly streamIndex: number;
};
