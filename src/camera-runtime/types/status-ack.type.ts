/**
 * Host acknowledgement of one worker status update.
 */
export type StatusAck = {
  /** Discriminant identifying this command, event, or message variant. */
  kind: 'status-ack';
  /** Worker lifetime identifier used to reject messages from an earlier worker instance. */
  epoch: number;
};
