import type { ExtractedJpegFrame } from '../../frame-extractor/index.js';
/**
 * JPEG frame sent from the camera worker to its host for delivery.
 */
export type FrameMessage = {
  /** Discriminant identifying this command, event, or message variant. */
  kind: 'frame';
  /** Worker lifetime identifier used to reject messages from an earlier worker instance. */
  epoch: number;
  /** Stream generation, advanced when the underlying RTSP session changes. */
  generation: number;
  /**
   * Identifier of the recording or frame consumer.
   */
  consumerId: string;
  /** Sequence number used to match messages with acknowledgements. */
  sequence: number;
  /** Decoded or encoded frame delivered by this operation. */
  frame: ExtractedJpegFrame;
};
