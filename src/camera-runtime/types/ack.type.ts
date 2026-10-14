/**
 * Acknowledgement of a worker event, scoped to one worker epoch and event sequence.
 */
export type Ack = {
  /** Discriminant identifying this command, event, or message variant. */
  kind: 'event-ack';
  /** Worker lifetime identifier used to reject messages from an earlier worker instance. */
  epoch: number;
  /** Sequence number used to match messages with acknowledgements. */
  sequence: number;
  /** Whether the corresponding operation failed. */
  failed: boolean;
};
