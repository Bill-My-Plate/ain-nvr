/**
 * Host acknowledgement for one worker-produced JPEG frame.
 */
export type FrameAck = {
  /** Worker lifetime identifier used to reject messages from an earlier worker instance. */
  epoch: number;
  /**
   * Identifier of the recording or frame consumer.
   */
  consumerId: string;
  /** Sequence number used to match messages with acknowledgements. */
  sequence: number;
};
