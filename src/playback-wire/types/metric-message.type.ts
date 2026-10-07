export type MetricMessage = {
  readonly type: 'metric';
  readonly generation: number;
  readonly name: 'decoder_reconfiguration' | 'decoder_recovery';
};
