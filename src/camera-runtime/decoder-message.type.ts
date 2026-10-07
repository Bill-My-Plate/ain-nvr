import type { ExtractedJpegFrame } from '../frame-extractor/index.js';
import type { WireError } from './wire-error.type.js';

export type DecoderMessage =
  | { type: 'ready' }
  | { type: 'frame'; frame: ExtractedJpegFrame }
  | { type: 'error'; error: WireError };
