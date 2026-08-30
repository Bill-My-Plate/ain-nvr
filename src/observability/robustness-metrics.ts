export type RobustnessMetricName =
  | 'normalizedSdpConfigurations'
  | 'inBandConfigurations'
  | 'reorderedPackets'
  | 'duplicatePackets'
  | 'lostPackets'
  | 'damagedAccessUnits'
  | 'discontinuities'
  | 'decoderReconfigurations'
  | 'decoderRecoveries';

export type RobustnessMetricsSnapshot = Readonly<Record<RobustnessMetricName, number>>;

const NAMES: readonly RobustnessMetricName[] = [
  'normalizedSdpConfigurations',
  'inBandConfigurations',
  'reorderedPackets',
  'duplicatePackets',
  'lostPackets',
  'damagedAccessUnits',
  'discontinuities',
  'decoderReconfigurations',
  'decoderRecoveries',
];

export class RobustnessMetrics {
  private readonly values = new Map<RobustnessMetricName, number>(
    NAMES.map((name) => [name, 0]),
  );

  increment(name: RobustnessMetricName, count = 1): void {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError('Metric increment must be a non-negative safe integer.');
    }
    this.values.set(name, (this.values.get(name) ?? 0) + count);
  }

  snapshot(): RobustnessMetricsSnapshot {
    return Object.fromEntries(
      NAMES.map((name) => [name, this.values.get(name) ?? 0]),
    ) as RobustnessMetricsSnapshot;
  }
}
