import type { ExtractedJpegFrame } from '../../frame-extractor/index.js';


export type FrameMessage = {
  kind: 'frame'; epoch: number; generation: number; consumerId: string; sequence: number;
  frame: ExtractedJpegFrame;
};
