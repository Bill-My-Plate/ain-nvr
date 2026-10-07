export type AckMessage = {
  readonly type: 'ack';
  readonly generation: number;
  readonly renderedThroughUs: number;
  readonly decodeQueueSize: number;
};
