import type { ExtractedJpegFrame } from '../../frame-extractor/index.js';
import type { WireError } from './wire-error.type.js';
/**
 * Frame or status message returned by the decoder process.
 */
export type DecoderMessage =
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'ready';
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'frame';
      /** Decoded or encoded frame delivered by this operation. */
      frame: ExtractedJpegFrame;
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'error';
      /** Failure associated with this event or operation. */
      error: WireError;
    };
