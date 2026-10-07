import type { RobustnessMetricName } from './robustness-metric-name.type.js';
import type { RobustnessMetricsSnapshot } from './robustness-metrics-snapshot.type.js';
import { NAMES } from './names.constant.js';

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
